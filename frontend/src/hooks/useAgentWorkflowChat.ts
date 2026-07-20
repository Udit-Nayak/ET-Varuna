import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const makeId = () =>
  crypto.randomUUID?.() ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const corridorLabel = (corridorId: string | null) => {
  const labels: Record<string, string> = {
    hormuz: "Strait of Hormuz",
    "bab-el-mandeb": "Bab-el-Mandeb",
    malacca: "Strait of Malacca",
    suez: "Suez Canal",
    "persian-gulf": "Persian Gulf",
  };

  return corridorId ? labels[corridorId] ?? corridorId : "general maritime corridor";
};

const formatVolume = (value: unknown) =>
  `${Math.round(Number(value) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} bbl`;

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
  const safetyBreached = Boolean(sroa.safety_threshold_breached);
  const severe = Number(dsm.capacity_loss_pct ?? 0) >= 65 || safetyBreached;

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
      content: `${severe ? "APO recommends activating alternate sourcing and route planning." : "APO recommends preparing alternate sourcing options while monitoring the zone."}\nActions:\n- ${severe ? "Open alternate supplier shortlist immediately" : "Prepare alternate supplier shortlist"}\n- ${safetyBreached ? "Cover residual supply gap through procurement alternatives" : "Keep reserve drawdown inside SROA safety bounds"}\n- Re-run the workflow if vessel exposure or GRIA intelligence changes\n\nAPO is currently a transparent orchestration heuristic derived from GRIA, DSM, and SROA outputs.`,
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
      content: `${apo.summary ?? "APO prepared procurement alternatives."}\nActions:\n${Array.isArray(apo.recommendedActions) ? apo.recommendedActions.map((item: string) => `- ${item}`).join("\n") : "n/a"}\nRoutes:\n${Array.isArray(apo.alternateRoutes) ? apo.alternateRoutes.map((item: string) => `- ${item}`).join("\n") : "n/a"}\n${apo.caveat ?? ""}`,
    },
    {
      role: "system",
      status: "done",
      content: payload.final ?? "Agent workflow completed.",
    },
  ];
};

export const useAgentWorkflowChat = () => {
  const [messages, setMessages] = useState<AgentChatMessageData[]>([
    {
      id: makeId(),
      role: "system",
      content: "Workspace ready. Draw a tension zone or ask any supply-chain risk question.",
      status: "done",
      timestamp: Date.now(),
    },
  ]);
  const [isBusy, setIsBusy] = useState(false);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(
    () => () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    },
    []
  );

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "Agent chat failed");
      }

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

  const clearMessages = useCallback(() => {
    setMessages([
      {
        id: makeId(),
        role: "system",
        content: "Transcript cleared. Draw a tension zone or ask any supply-chain risk question.",
        status: "done",
        timestamp: Date.now(),
      },
    ]);
  }, []);

  return { messages, isBusy, analyzeZoneWithAgents, askQuestion, clearMessages };
};
