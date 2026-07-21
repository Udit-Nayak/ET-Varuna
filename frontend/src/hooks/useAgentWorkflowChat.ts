import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { TensionZone } from "./useSimulation";
import { Vessel } from "./useVesselStream";
import { pointInPolygon } from "../utils/geo";

export type AgentChatRole = "system" | "gria" | "dsm" | "sroa" | "apo" | "user";
export type AgentChatStatus = "pending" | "streaming" | "done" | "error";

export interface AgentChatMessageData {
  id: string;
  role: AgentChatRole;
  content: string;
  status: AgentChatStatus;
  timestamp: number;
}

export type AgentWorkflowPayload = Record<string, any> | null;

export interface ChatSessionSummary {
  id: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const makeId = () =>
  crypto.randomUUID?.() ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const starterMessage = (content = "Workspace ready. Draw a tension zone or ask any supply-chain risk question."): AgentChatMessageData => ({
  id: makeId(),
  role: "system",
  content,
  status: "done",
  timestamp: Date.now(),
});

const titleFromMessages = (messages: AgentChatMessageData[]) => {
  const firstUser = messages.find((message) => message.role === "user" && message.content.trim());
  const firstZone = messages.find((message) => message.content.toLowerCase().startsWith("analyzing "));
  const source = firstUser?.content || firstZone?.content || "New chat";
  return source.length > 56 ? `${source.slice(0, 53)}...` : source;
};

export const corridorLabel = (corridorId: string | null) => {
  const labels: Record<string, string> = {
    hormuz: "Strait of Hormuz",
    "bab-el-mandeb": "Bab-el-Mandeb",
    malacca: "Strait of Malacca",
    suez: "Suez Canal",
    "persian-gulf": "Persian Gulf",
    panama: "Panama Canal",
    "english-channel": "English Channel",
    gibraltar: "Strait of Gibraltar",
    bosphorus: "Bosphorus Strait",
    "cape-of-good-hope": "Cape of Good Hope",
    "south-china-sea": "South China Sea",
  };

  return corridorId ? labels[corridorId] ?? corridorId : "general maritime corridor";
};

const formatVolume = (value: unknown) =>
  `${Math.round(Number(value) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} bbl`;

const formatUsd = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? `USD ${number.toFixed(2)}/bbl` : "price n/a";
};

const formatApoPayload = (apo: any) => {
  if (typeof apo?.formatted_recommendation === "string" && apo.formatted_recommendation.trim()) {
    const providerLine = apo.llm_used ? `\n\nFormatted by ${apo.llm_provider ?? "LLM"}.` : "";
    return `${apo.formatted_recommendation.trim()}${providerLine}`;
  }

  const options = Array.isArray(apo?.ranked_options) ? apo.ranked_options.slice(0, 3) : [];
  const totalNeeded = Number(apo?.total_volume_needed ?? 0);
  if (options.length === 0) {
    return `APO found no feasible procurement option for ${formatVolume(totalNeeded)} residual supply gap.`;
  }

  const lines = [
    `APO procurement ranking for ${apo?.corridor ?? "the selected corridor"}.`,
    `Residual requirement: ${formatVolume(totalNeeded)}.`,
  ];

  options.forEach((option: any, index: number) => {
    lines.push(
      `${index + 1}. ${option.supplier_name ?? "Unknown supplier"} via ${option.via ?? "unknown route"}`,
      `   Covers ${formatVolume(option.volume_offered)} | ${formatUsd(option.landed_cost_per_barrel)} | ${Number(option.transit_days ?? 0)}d transit | route risk ${Number(option.route_risk_score ?? 0).toFixed(0)}/100 | score ${Number(option.composite_score ?? 0).toFixed(3)}`,
      option.explanation ? `   Reason: ${option.explanation}` : ""
    );
  });

  if (Array.isArray(apo?.llm_flags) && apo.llm_flags.length > 0) {
    lines.push(`Flags: ${apo.llm_flags.join("; ")}`);
  }

  return lines.filter(Boolean).join("\n");
};

const addMessage = (
  setMessages: Dispatch<SetStateAction<AgentChatMessageData[]>>,
  message: Omit<AgentChatMessageData, "id" | "timestamp">
) => {
  const id = makeId();
  setMessages((current) => [...current, { ...message, id, timestamp: Date.now() }]);
  return id;
};

const buildAgentMessages = (payload: any): Array<Omit<AgentChatMessageData, "id" | "timestamp">> => {
  const griaMatches = Array.isArray(payload.gria?.matches) ? payload.gria.matches.length : 0;
  const dsm = payload.dsm ?? {};
  const sroa = payload.sroa ?? {};
  const apo = payload.apo ?? {};
  const safetyBreached = Boolean(sroa.safety_threshold_breached);

  return [
    {
      role: "gria",
      status: "done",
      content: `GRIA found ${griaMatches} intelligence matches for ${payload.corridor ?? "this corridor"}. Query: ${payload.gria?.query ?? "n/a"}`,
    },
    {
      role: "dsm",
      status: "done",
      content: `DSM projects ${Number(dsm.capacity_loss_pct ?? 0)}% capacity loss for ${Number(dsm.duration_days ?? 0)} days. ${dsm.summary ?? "No DSM summary returned."}`,
    },
    {
      role: "sroa",
      status: safetyBreached ? "error" : "done",
      content: `SROA policy: ${sroa.policy ?? "n/a"}. Release volume: ${formatVolume(sroa.total_released_volume)}. Reserve after plan: ${Number(sroa.reserve_after_plan_days ?? 0).toFixed(2)} days. ${
        safetyBreached ? "Safety threshold breached." : "Safety threshold protected."
      } ${sroa.summary ?? ""}`,
    },
    {
      role: "apo",
      status: "done",
      content: formatApoPayload(apo),
    },
    {
      role: "system",
      status: "done",
      content: payload.recommendation ?? "No final recommendation returned.",
    },
  ];
};

const buildGeneralChatMessages = (payload: any): Array<Omit<AgentChatMessageData, "id" | "timestamp">> => {
  const griaMatches = Array.isArray(payload.gria?.matches) ? payload.gria.matches.length : 0;
  const dsm = payload.dsm ?? {};
  const sroa = payload.sroa ?? {};
  const apo = payload.apo ?? {};
  const normalized = payload.normalized ?? {};
  const safetyBreached = Boolean(sroa.safety_threshold_breached);

  return [
    {
      role: "system",
      status: "done",
      content: `Understood as: ${normalized.normalizedQuery ?? "general operator question"}\nCorridor/topic: ${normalized.corridor ?? "general"}\nIntent: ${normalized.userIntent ?? "general"}`,
    },
    {
      role: "gria",
      status: "done",
      content: `${payload.gria?.summary ?? "GRIA completed intelligence retrieval."}\nMatches: ${griaMatches}\nQuery: ${payload.gria?.query ?? "n/a"}`,
    },
    {
      role: "dsm",
      status: "done",
      content: `DSM scenario: ${dsm.capacity_loss_pct ?? 0}% capacity loss for ${dsm.duration_days ?? 0} days on ${dsm.corridor ?? "the selected corridor"}.\n${dsm.summary ?? "DSM completed scenario modelling."}`,
    },
    {
      role: "sroa",
      status: safetyBreached ? "error" : "done",
      content: `SROA policy: ${sroa.policy ?? "balanced"}.\nRelease volume: ${formatVolume(sroa.total_released_volume)}.\nReserve after plan: ${Number(sroa.reserve_after_plan_days ?? 0).toFixed(2)} days.\n${safetyBreached ? "Safety threshold under stress." : "Safety threshold protected."}\n${sroa.summary ?? ""}`,
    },
    {
      role: "apo",
      status: "done",
      content: formatApoPayload(apo),
    },
    {
      role: "system",
      status: "done",
      content: payload.final ?? "Agent workflow completed.",
    },
  ];
};

export const useAgentWorkflowChat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AgentChatMessageData[]>([starterMessage()]);
  const [isBusy, setIsBusy] = useState(false);
  const [latestWorkflow, setLatestWorkflow] = useState<AgentWorkflowPayload>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const timeoutsRef = useRef<number[]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const loadingSessionRef = useRef(false);
  const bootstrappedRef = useRef(false);

  useEffect(
    () => () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    },
    []
  );

  const chatFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!user) throw new Error("Sign in required");
      const token = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...((init.headers as Record<string, string> | undefined) ?? {}),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || payload.error || "Chat request failed");
      return payload;
    },
    [user]
  );

  const refreshSessions = useCallback(async () => {
    if (!user) return [];
    setIsHistoryLoading(true);
    try {
      const payload = await chatFetch("/api/chat/sessions");
      const nextSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      setSessions(nextSessions);
      return nextSessions as ChatSessionSummary[];
    } finally {
      setIsHistoryLoading(false);
    }
  }, [chatFetch, user]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!user) return;
      loadingSessionRef.current = true;
      setIsHistoryLoading(true);
      try {
        const payload = await chatFetch(`/api/chat/sessions/${sessionId}`);
        const session = payload.session ?? {};
        setActiveSessionId(String(session._id ?? session.id ?? sessionId));
        setMessages(Array.isArray(session.messages) && session.messages.length > 0 ? session.messages : [starterMessage()]);
        setLatestWorkflow(session.latestWorkflow ?? null);
        setHistoryOpen(false);
      } finally {
        setIsHistoryLoading(false);
        window.setTimeout(() => {
          loadingSessionRef.current = false;
        }, 0);
      }
    },
    [chatFetch, user]
  );

  useEffect(() => {
    if (!user) {
      bootstrappedRef.current = false;
      setSessions([]);
      setActiveSessionId(null);
      setLatestWorkflow(null);
      setMessages([starterMessage()]);
      return;
    }

    let cancelled = false;
    bootstrappedRef.current = false;
    setIsHistoryLoading(true);
    chatFetch("/api/chat/sessions")
      .then(async (payload) => {
        if (cancelled) return;
        const nextSessions = Array.isArray(payload.sessions) ? (payload.sessions as ChatSessionSummary[]) : [];
        setSessions(nextSessions);
        if (nextSessions[0]) {
          await loadSession(nextSessions[0].id);
        }
      })
      .catch((error) => console.warn("Chat history load skipped:", error))
      .finally(() => {
        if (!cancelled) {
          bootstrappedRef.current = true;
          setIsHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatFetch, loadSession, user]);

  const persistSession = useCallback(async () => {
    if (!user || !bootstrappedRef.current || loadingSessionRef.current || isBusy) return;
    const hasUserWork = messages.some((message) => message.role === "user") || messages.some((message) => message.content.toLowerCase().startsWith("analyzing "));
    if (!hasUserWork) return;

    const stableMessages = messages.filter((message) => message.status !== "streaming" && message.status !== "pending");
    if (stableMessages.length === 0) return;

    setIsSaving(true);
    try {
      const body = JSON.stringify({
        title: titleFromMessages(stableMessages),
        messages: stableMessages,
        latestWorkflow,
      });
      if (activeSessionId) {
        await chatFetch(`/api/chat/sessions/${activeSessionId}`, { method: "PATCH", body });
      } else {
        const payload = await chatFetch("/api/chat/sessions", { method: "POST", body });
        const id = String(payload.session?._id ?? payload.session?.id ?? "");
        if (id) setActiveSessionId(id);
      }
      await refreshSessions();
    } catch (error) {
      console.warn("Chat autosave skipped:", error);
    } finally {
      setIsSaving(false);
    }
  }, [activeSessionId, chatFetch, isBusy, latestWorkflow, messages, refreshSessions, user]);

  useEffect(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistSession();
    }, 850);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [persistSession]);

  const analyzeZoneWithAgents = useCallback(async (zone: TensionZone, vessels: Vessel[]) => {
    const label = corridorLabel(zone.corridorId);
    const zoneVessels = vessels.filter((vessel) => pointInPolygon([vessel.lon, vessel.lat], zone.polygon));
    setIsBusy(true);
    addMessage(setMessages, {
      role: "system",
      status: "done",
      content: `Analyzing ${zone.name} - ${label}...`,
    });
    const streamingId = addMessage(setMessages, {
      role: "gria",
      status: "streaming",
      content: "GRIA, DSM, and SROA are running the live zone workflow",
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/map/analyze-zone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneId: zone.id,
          zoneName: zone.name,
          polygon: zone.polygon,
          corridorId: zone.corridorId,
          corridorName: label,
          tensionPct: zone.tensionPct,
          durationDays: zone.durationDays,
          affectedVesselCount: zoneVessels.length,
          affectedTankers: zoneVessels.filter((vessel) => vessel.isTanker).length,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "Agent analysis failed");
      }

      setLatestWorkflow(payload);
      setMessages((current) => current.filter((message) => message.id !== streamingId));
      buildAgentMessages(payload).forEach((message, index) => {
        const timeoutId = window.setTimeout(() => addMessage(setMessages, message), index * 400);
        timeoutsRef.current.push(timeoutId);
      });
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === streamingId
            ? {
                ...message,
                role: "system",
                status: "error",
                content: error instanceof Error ? error.message : "Agent analysis failed",
                timestamp: Date.now(),
              }
            : message
        )
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  const askQuestion = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    addMessage(setMessages, { role: "user", status: "done", content: trimmed });
    const streamingId = addMessage(setMessages, {
      role: "gria",
      status: "streaming",
      content: "Normalizing your question and running GRIA, DSM, SROA, and APO",
    });
    setIsBusy(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user?.getIdToken()}`,
        },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "Agent chat failed");
      }

      setLatestWorkflow(payload);
      setMessages((current) => current.filter((message) => message.id !== streamingId));
      buildGeneralChatMessages(payload).forEach((message, index) => {
        const timeoutId = window.setTimeout(() => addMessage(setMessages, message), index * 350);
        timeoutsRef.current.push(timeoutId);
      });
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === streamingId
            ? {
                ...message,
                status: "error",
                content: error instanceof Error ? error.message : "Agent chat failed",
                timestamp: Date.now(),
              }
            : message
        )
      );
    } finally {
      setIsBusy(false);
    }
  }, []);

  const startNewChat = useCallback(() => {
    setLatestWorkflow(null);
    setActiveSessionId(null);
    setHistoryOpen(false);
    setMessages([starterMessage("New chat ready. Draw a tension zone or ask any supply-chain risk question.")]);
  }, []);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await chatFetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
      if (activeSessionId === sessionId) {
        startNewChat();
      }
      await refreshSessions();
    },
    [activeSessionId, chatFetch, refreshSessions, startNewChat]
  );

  return {
    messages,
    isBusy,
    latestWorkflow,
    sessions,
    activeSessionId,
    historyOpen,
    isHistoryLoading,
    isSaving,
    analyzeZoneWithAgents,
    askQuestion,
    clearMessages: startNewChat,
    startNewChat,
    loadSession,
    deleteSession,
    setHistoryOpen,
  };
};
