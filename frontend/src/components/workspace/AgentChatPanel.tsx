import { FormEvent, useEffect, useRef, useState } from "react";
import AgentChatMessage from "./AgentChatMessage";
import { AgentChatMessageData, AgentWorkflowPayload, ChatSessionSummary } from "../../hooks/useAgentWorkflowChat";
import { SimulationImpact, TensionZone } from "../../hooks/useSimulation";
import { useAuth } from "../../context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
type AgentTab = "dsm" | "sroa" | "apo" | "tfm";

interface AgentChatPanelProps {
  messages: AgentChatMessageData[];
  latestWorkflow: AgentWorkflowPayload;
  isBusy: boolean;
  isSaving: boolean;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  historyOpen: boolean;
  isHistoryLoading: boolean;
  compact: boolean;
  zones: TensionZone[];
  impact: SimulationImpact;
  onAskQuestion: (query: string) => void;
  onClear: () => void;
  onToggleHistory: () => void;
  onStartNewChat: () => void;
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onAnalyzeZone: (zone: TensionZone) => void;
  onSetTension: (id: string, pct: number) => void;
  onSetDuration: (id: string, days: number) => void;
  onRemoveZone: (id: string) => void;
}

const formatBpd = (value: number) =>
  `${Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 })} BPD`;

const isTurnStarter = (message: AgentChatMessageData) =>
  message.role === "user" || message.content.toLowerCase().startsWith("analyzing ");

const groupConversationTurns = (messages: AgentChatMessageData[]) => {
  const turns: Array<{ id: string; prompt: AgentChatMessageData | null; responses: AgentChatMessageData[] }> = [];

  messages.forEach((message) => {
    if (isTurnStarter(message)) {
      turns.push({
        id: `turn-${message.id}`,
        prompt: message,
        responses: [],
      });
      return;
    }

    if (turns.length === 0) {
      turns.push({ id: "turn-initial", prompt: null, responses: [] });
    }
    turns[turns.length - 1].responses.push(message);
  });

  return turns;
};

const agentMeta: Record<AgentTab, { label: string; color: string; desc: string }> = {
  dsm: { label: "DSM", color: "text-amber border-amber/50", desc: "Disruption simulation and impact timeline" },
  sroa: { label: "SROA", color: "text-safe border-safe/50", desc: "Reserve release policy and safety threshold" },
  apo: { label: "APO", color: "text-muted border-muted/50", desc: "Procurement alternatives and route ranking" },
  tfm: { label: "TFM", color: "text-[#5EC9FF] border-[#5EC9FF]/50", desc: "Trade flow monitor and India petroleum state" },
};

const localSummary = (agent: AgentTab, workflow: AgentWorkflowPayload) => {
  if (agent === "tfm") return "TFM loads latest India petroleum market stats from nationalStateHistory and livePriceSnapshot.";
  const data = workflow?.[agent];
  if (!data) return "No output is available for this agent yet.";
  if (agent === "dsm") {
    return [
      `Corridor: ${data.corridor ?? workflow?.corridor ?? "n/a"}`,
      `Capacity loss: ${Number(data.capacity_loss_pct ?? 0)}%`,
      `Duration: ${Number(data.duration_days ?? 0)} days`,
      `Timeline points: ${Array.isArray(data.impact_timeline) ? data.impact_timeline.length : 0}`,
    ].join("\n");
  }
  if (agent === "sroa") {
    return [
      `Policy: ${data.policy ?? "n/a"}`,
      `Release volume: ${Math.round(Number(data.total_released_volume ?? 0)).toLocaleString("en-US")} bbl`,
      `Reserve after plan: ${Number(data.reserve_after_plan_days ?? 0).toFixed(2)} days`,
      `Safety: ${data.safety_threshold_breached ? "threshold breached" : "threshold protected"}`,
    ].join("\n");
  }
  const top = Array.isArray(data.ranked_options) ? data.ranked_options[0] : null;
  return [
    `Need: ${Math.round(Number(data.total_volume_needed ?? 0)).toLocaleString("en-US")} bbl`,
    top ? `Top option: ${top.supplier_name} via ${top.via}` : "Top option: n/a",
    top ? `Transit: ${top.transit_days} days | Risk: ${Number(top.route_risk_score ?? 0).toFixed(0)}/100` : "",
  ].filter(Boolean).join("\n");
};

type TfmLivePayload = {
  generated_at?: string;
  country?: string;
  mode?: string;
  sources?: Record<string, any>;
  metrics?: Record<string, any>;
  caveats?: string[];
  note?: string | null;
};

const formatMetric = (value: unknown, suffix = "", digits = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "n/a";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + suffix;
};

const TfmOutputView = ({ compact, workflow }: { compact: boolean; workflow: AgentWorkflowPayload }) => {
  const [snapshot, setSnapshot] = useState<TfmLivePayload | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadSnapshot = () => {
    setIsLoading(true);
    setError("");
    fetch(API_BASE_URL + "/api/tfm/live")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || payload.error || "Failed to load TFM live snapshot");
        setSnapshot(payload);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load TFM live snapshot");
        if (!snapshot && workflow?.sroa?.operational_data) {
          setSnapshot({
            mode: "workflow-fallback",
            country: "India",
            generated_at: new Date().toISOString(),
            sources: { petroleum_state: { source: "latest SROA workflow fallback", freshness: { label: "workflow snapshot" } } },
            metrics: workflow.sroa.operational_data,
            caveats: ["TFM live endpoint was unavailable; showing latest SROA operational data fallback."],
          });
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSnapshot();
    const intervalId = window.setInterval(loadSnapshot, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const metrics = snapshot?.metrics ?? {};
  const sources = snapshot?.sources ?? {};
  const basket = metrics.basket_composition ?? {};
  const supplierMix = metrics.top_suppliers_pct ?? metrics.baseline_import_source_mix ?? {};
  const corridorSupply = metrics.corridor_supply ?? {};

  return (
    <section className="flex h-full min-w-0 flex-col">
      <div className={(compact ? "px-3 py-3" : "px-5 py-4") + " border-b border-border bg-base/50"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded border border-[#5EC9FF]/50 px-2 py-0.5 font-mono text-[10px] tracking-wider text-[#5EC9FF]">TFM</div>
            <h3 className="mt-2 font-display text-xl font-semibold tracking-tight">Live India trade flow monitor</h3>
            <p className="mt-1 font-mono text-[11px] text-muted">Auto-refreshes every 30s · {snapshot?.mode ?? "loading"}</p>
          </div>
          <button
            type="button"
            onClick={loadSnapshot}
            className="rounded border border-border bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-[#5EC9FF] hover:text-[#5EC9FF]"
          >
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <div className={(compact ? "p-3" : "p-5") + " min-h-0 flex-1 overflow-y-auto"}>
        {error && <div className="mb-3 rounded border border-risk/60 bg-risk/10 p-3 font-mono text-xs text-risk">{error}</div>}
        {!snapshot ? (
          <div className="rounded-md border border-border bg-base/70 p-4 font-mono text-sm text-muted">Loading TFM live dashboard...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <TfmMetric label="Crude basket price" value={metrics.current_price_usd_per_barrel ? "$" + formatMetric(metrics.current_price_usd_per_barrel, "/bbl", 2) : "n/a"} accent />
              <TfmMetric label="Month-to-date avg" value={metrics.month_to_date_avg_usd ? "$" + formatMetric(metrics.month_to_date_avg_usd, "/bbl", 2) : "n/a"} />
              <TfmMetric label="Total consumption" value={formatMetric(metrics.total_consumption_bpd ?? metrics.daily_consumption_rate, " BPD")} />
              <TfmMetric label="Total imports" value={formatMetric(metrics.total_import_volume_bpd ?? metrics.recent_import_volume, " BPD")} />
              <TfmMetric label="Domestic production" value={formatMetric(metrics.domestic_production_bpd, " BPD")} />
              <TfmMetric label="Estimated exports / surplus" value={formatMetric(metrics.estimated_export_or_surplus_bpd ?? metrics.recent_export_volume, " BPD")} />
              <TfmMetric label="Import dependency" value={formatMetric(metrics.import_dependency_pct, "%", 1)} />
              <TfmMetric label="Current SPR reserve" value={formatMetric(metrics.current_reserve_days, " days", 2)} accent />
              <TfmMetric label="Reserve volume" value={formatMetric(metrics.current_reserve_volume_bbl ?? metrics.current_reserve_volume, " bbl")} />
              <TfmMetric label="Commercial stock" value={formatMetric(metrics.commercial_stock_days, " days", 1)} />
              <TfmMetric label="Total oil availability" value={formatMetric(metrics.total_oil_availability_days, " days", 1)} />
              <TfmMetric label="AIS trade vessels" value={formatMetric(metrics.ais_trade_vessels, " vessels")} accent />
              <TfmMetric label="AIS tankers" value={formatMetric(metrics.ais_tankers, " tankers")} />
              <TfmMetric label="AIS live/simulated" value={formatMetric(metrics.ais_live_vessels) + " live · " + formatMetric(metrics.ais_simulated_vessels) + " sim"} />
              <TfmMetric label="Generated" value={snapshot.generated_at ? new Date(snapshot.generated_at).toLocaleTimeString() : "n/a"} />
            </div>

            <TfmSection title="Source Freshness">
              {Object.entries(sources).map(([name, source]) => (
                <TfmKeyValue key={name} label={name.replace(/_/g, " ")} value={String(source?.source ?? "n/a") + " · " + String(source?.freshness?.label ?? "snapshot")} />
              ))}
            </TfmSection>

            <TfmSection title="Crude Basket Composition">
              <TfmKeyValue label="Sour crude" value={formatMetric(basket.sour_pct ?? basket.basket_ratio_sour_pct, "%", 1)} />
              <TfmKeyValue label="Sweet crude" value={formatMetric(basket.sweet_pct ?? basket.basket_ratio_sweet_pct, "%", 1)} />
              <TfmKeyValue label="Price last updated" value={String(sources.price?.ppac_last_updated ?? "n/a")} />
            </TfmSection>

            <TfmSection title="Top Supplier Mix">
              {Object.keys(supplierMix).length > 0 ? Object.entries(supplierMix).map(([name, value]) => (
                <TfmKeyValue key={name} label={name} value={formatMetric(value, "%", 1)} />
              )) : <div className="font-mono text-xs text-muted">Supplier mix not available.</div>}
            </TfmSection>

            <TfmSection title="Corridor Supply Exposure">
              {Object.keys(corridorSupply).length > 0 ? Object.entries(corridorSupply).map(([name, raw]) => {
                const value = raw as any;
                return <TfmKeyValue key={name} label={name.replace(/_/g, " ")} value={formatMetric(value?.volume_bpd, " BPD") + " · " + formatMetric(value?.share_pct, "%", 1)} />;
              }) : <div className="font-mono text-xs text-muted">Corridor supply data not available.</div>}
            </TfmSection>

            {snapshot.caveats?.length ? (
              <TfmSection title="Freshness Caveats">
                {snapshot.caveats.map((caveat) => <div key={caveat} className="font-mono text-xs leading-6 text-muted">{caveat}</div>)}
              </TfmSection>
            ) : null}

            {snapshot.note && <div className="rounded-md border border-border bg-base/70 p-4 text-sm leading-7 text-ink/90"><div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">Context note</div>{String(snapshot.note)}</div>}
          </div>
        )}
      </div>
    </section>
  );
};

const TfmMetric = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
  <div className="rounded-md border border-border bg-base/70 p-3">
    <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</div>
    <div className={"mt-2 break-words font-display text-lg font-semibold " + (accent ? "text-[#5EC9FF]" : "text-ink")}>{value}</div>
  </div>
);

const TfmSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-md border border-border bg-base/70 p-4">
    <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted">{title}</div>
    <div className="grid gap-2 md:grid-cols-2">{children}</div>
  </section>
);

const TfmKeyValue = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-w-0 items-center justify-between gap-3 rounded border border-border/70 bg-surface/70 px-3 py-2 font-mono text-xs">
    <span className="min-w-0 break-words text-muted">{label}</span>
    <span className="shrink-0 text-right text-ink">{value}</span>
  </div>
);
const AgentOutputView = ({ agent, workflow, compact }: { agent: AgentTab | null; workflow: AgentWorkflowPayload; compact: boolean }) => {
  const { user } = useAuth();
  const [formatted, setFormatted] = useState("");
  const [isFormatting, setIsFormatting] = useState(false);
  const [usedGemini, setUsedGemini] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (agent === "tfm") {
      setFormatted("");
      setError("");
      setUsedGemini(false);
      setIsFormatting(false);
      return;
    }
    if (!agent || !workflow) {
      setFormatted("");
      setError("");
      setUsedGemini(false);
      return;
    }

    let cancelled = false;
    setIsFormatting(true);
    setError("");
    setUsedGemini(false);
    setFormatted(localSummary(agent, workflow));

    user?.getIdToken()
      .then((token) =>
        fetch(`${API_BASE_URL}/api/chat/format-agent-output`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ agent, payload: workflow }),
        })
      )
      .then(async (response) => {
        if (!response) throw new Error("Sign in required");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || payload.error || "Formatter failed");
        if (!cancelled) {
          setFormatted(String(payload.formatted ?? localSummary(agent, workflow)));
          setUsedGemini(Boolean(payload.usedGemini));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Formatter failed");
      })
      .finally(() => {
        if (!cancelled) setIsFormatting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agent, workflow, user]);

  if (agent === "tfm") {
    return <TfmOutputView compact={compact} workflow={workflow} />;
  }

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center font-mono text-sm text-muted">
        Select DSM, SROA, APO, or TFM above to open the full output.
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center font-mono text-sm text-muted">
        Run a zone or ask the workflow first. The latest DSM/SROA/APO output will appear here. TFM can be opened anytime for current India stats.
      </div>
    );
  }

  const meta = agentMeta[agent];

  return (
    <section className="flex h-full min-w-0 flex-col">
      <div className={`${compact ? "px-3 py-3" : "px-5 py-4"} border-b border-border bg-base/50`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={`inline-flex rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider ${meta.color}`}>{meta.label}</div>
            <h3 className="mt-2 font-display text-xl font-semibold tracking-tight">{meta.desc}</h3>
            <p className="mt-1 font-mono text-[11px] text-muted">Corridor: {workflow?.corridor ?? workflow?.normalized?.corridor ?? "latest workflow"}</p>
          </div>
          <div className="rounded border border-border bg-surface px-3 py-2 font-mono text-[10px] text-muted">
            {isFormatting ? "Formatting with Gemini..." : error ? "Detailed fallback shown" : usedGemini ? "Gemini formatted" : "Detailed fallback shown"}
          </div>
        </div>
      </div>

      <div className={`${compact ? "p-3" : "p-5"} min-h-0 flex-1 overflow-y-auto`}>
        {error && <div className="mb-3 rounded border border-risk/60 bg-risk/10 p-3 font-mono text-xs text-risk">{error}</div>}
        <article className="rounded-md border border-border bg-base/70 p-4 shadow-inner shadow-base/30">
          <div className="whitespace-pre-wrap text-sm leading-7 text-ink/90">{formatted || localSummary(agent, workflow)}</div>
        </article>
      </div>
    </section>
  );
};

const AgentChatPanel = ({
  messages,
  latestWorkflow,
  isBusy,
  isSaving,
  sessions,
  activeSessionId,
  historyOpen,
  isHistoryLoading,
  compact,
  zones,
  impact,
  onAskQuestion,
  onClear,
  onToggleHistory,
  onStartNewChat,
  onLoadSession,
  onDeleteSession,
  onAnalyzeZone,
  onSetTension,
  onSetDuration,
  onRemoveZone,
}: AgentChatPanelProps) => {
  const [query, setQuery] = useState("");
  const [activeAgent, setActiveAgent] = useState<AgentTab | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeAgent) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeAgent]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onAskQuestion(query);
    setQuery("");
  };

  return (
    <aside className="pointer-events-auto flex h-full min-w-0 flex-col border-l border-border bg-surface/95 text-ink shadow-2xl shadow-base/40 backdrop-blur">
      <div className={`${compact ? "px-3 py-3" : "px-5 py-4"} border-b border-border`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-amber">Agent Workflow</div>
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">{activeAgent ? "Agent output" : "Live response chat"}</h2>
            {!activeAgent && (
              <div className="mt-1 font-mono text-[10px] text-muted">
                {isHistoryLoading ? "Loading history..." : isSaving ? "Saving chat..." : activeSessionId ? "Saved conversation" : "New conversation"}
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {(Object.keys(agentMeta) as AgentTab[]).map((agent) => (
              <button
                key={agent}
                type="button"
                onClick={() => setActiveAgent(agent)}
                className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${activeAgent === agent ? agentMeta[agent].color : "border-border text-muted hover:border-amber hover:text-amber"}`}
              >
                {agentMeta[agent].label}
              </button>
            ))}
            <button
              type="button"
              onClick={onToggleHistory}
              title={historyOpen ? "Close chat history" : "Open chat history"}
              aria-label={historyOpen ? "Close chat history" : "Open chat history"}
              className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                historyOpen ? "border-amber bg-amber/10 text-amber" : "border-border bg-base/70 text-muted hover:border-amber hover:text-amber"
              }`}
            >
              <SidebarToggleIcon />
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeAgent) {
                  setActiveAgent(null);
                } else {
                  onClear();
                }
              }}
              className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber hover:text-amber"
            >
              {activeAgent ? "Chat" : "Clear"}
            </button>
          </div>
        </div>
        {!activeAgent && (
          <div className={`mt-3 grid ${compact ? "grid-cols-1" : "grid-cols-3"} gap-2 font-mono text-[10px] text-muted`}>
            <div className="rounded border border-border bg-base/60 p-2">
              <div>Zones</div>
              <div className="text-sm font-semibold text-ink">{zones.length}</div>
            </div>
            <div className="rounded border border-border bg-base/60 p-2">
              <div>At risk</div>
              <div className="text-sm font-semibold text-amber">{formatBpd(impact.totalVolumeAtRisk)}</div>
            </div>
            <div className="rounded border border-border bg-base/60 p-2">
              <div>SPR days</div>
              <div className="text-sm font-semibold text-safe">{impact.minSprDaysRemaining.toFixed(1)}</div>
            </div>
          </div>
        )}
      </div>

      {activeAgent ? (
        <div className="min-h-0 flex-1">
          <AgentOutputView agent={activeAgent} workflow={latestWorkflow} compact={compact} />
        </div>
      ) : (
        <div className="relative min-h-0 flex flex-1 overflow-hidden">
          {historyOpen && (
            <ChatHistorySidebar
              sessions={sessions}
              activeSessionId={activeSessionId}
              isLoading={isHistoryLoading}
              overlay={compact}
              onNewChat={onStartNewChat}
              onLoadSession={onLoadSession}
              onDeleteSession={onDeleteSession}
              onClose={onToggleHistory}
            />
          )}
          <div className="min-w-0 flex flex-1 flex-col">
          {zones.length > 0 && (
            <div className={`${compact ? "px-3 py-3" : "px-5 py-4"} max-h-56 overflow-y-auto border-b border-border bg-base/35`}>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">Active tension zones</div>
              <div className="space-y-2">
                {zones.map((zone) => (
                  <div key={zone.id} className="rounded border border-border bg-surface/80 p-2 font-mono text-[11px] text-muted">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{zone.name}</span>
                      <button type="button" className="text-risk hover:text-ink" onClick={() => onRemoveZone(zone.id)}>
                        Delete
                      </button>
                    </div>
                    <label className="mb-2 block">
                      <div className="mb-1 flex justify-between">
                        <span>Tension</span>
                        <span className="text-ink">{zone.tensionPct}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={zone.tensionPct}
                        className="w-full accent-amber"
                        onChange={(event) => onSetTension(zone.id, Number(event.target.value))}
                      />
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={zone.durationDays}
                        className="min-w-0 flex-1 rounded border border-border bg-base px-2 py-1 text-ink outline-none focus:border-amber"
                        onChange={(event) => onSetDuration(zone.id, Number(event.target.value))}
                      />
                      <button
                        type="button"
                        className="rounded border border-amber/60 px-2 py-1 text-amber transition-colors hover:bg-amber/10"
                        onClick={() => onAnalyzeZone(zone)}
                      >
                        Run
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

            <div ref={scrollRef} className={`${compact ? "p-3" : "p-5"} min-h-0 flex-1 overflow-y-auto`}>
              <div className={compact ? "space-y-4" : "space-y-6"}>
                {groupConversationTurns(messages).map((turn, index) => (
                  <section
                    key={turn.id}
                    className={`${index === 0 ? "" : "border-t border-border/70 pt-4"} ${compact ? "space-y-2" : "space-y-3"}`}
                  >
                    {turn.prompt && <AgentChatMessage message={turn.prompt} compact={compact} />}
                    {turn.responses.length > 0 && (
                      <div className={`${turn.prompt ? "border-l border-border/70 pl-3" : ""} space-y-3`}>
                        {turn.responses.map((message) => (
                          <AgentChatMessage key={message.id} message={message} compact={compact} />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>

          <form onSubmit={handleSubmit} className={`${compact ? "p-3" : "p-4"} border-t border-border bg-base/80`}>
            <div className={`flex ${compact ? "flex-col" : "flex-row"} gap-2`}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask about Hormuz, reserves, rerouting, prices..."
                className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-amber"
              />
              <button
                type="submit"
                disabled={isBusy || !query.trim()}
                className="rounded bg-amber px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-base transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
          </div>
        </div>
      )}
    </aside>
  );
};

const SidebarToggleIcon = () => (
  <span className="relative block h-4 w-4 rounded-[3px] border border-current">
    <span className="absolute bottom-[3px] left-[4px] top-[3px] w-px bg-current opacity-80" />
  </span>
);

const ChatHistorySidebar = ({
  sessions,
  activeSessionId,
  isLoading,
  overlay,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  onClose,
}: {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  isLoading: boolean;
  overlay: boolean;
  onNewChat: () => void;
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClose: () => void;
}) => (
  <aside
    className={`${
      overlay ? "absolute inset-y-0 left-0 z-30 w-[min(320px,92%)] shadow-2xl shadow-base/70" : "relative w-[280px] shrink-0"
    } flex min-h-0 flex-col border-r border-border bg-base/95 backdrop-blur`}
  >
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">Chat history</div>
        <div className="mt-1 truncate font-display text-sm font-semibold text-ink">{sessions.length} saved</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber hover:text-amber"
      >
        Close
      </button>
    </div>

    <div className="border-b border-border p-3">
      <button
        type="button"
        onClick={onNewChat}
        className="w-full rounded-md border border-amber/60 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-amber transition-colors hover:bg-amber/10"
      >
        New chat
      </button>
    </div>

    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {isLoading ? (
        <div className="rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-muted">Loading saved chats...</div>
      ) : sessions.length === 0 ? (
        <div className="rounded border border-border bg-surface px-3 py-2 font-mono text-xs text-muted">No saved chats yet.</div>
      ) : (
        sessions.map((session) => (
          <div
            key={session.id}
            className={`group flex min-w-0 items-start gap-2 rounded border px-3 py-2 ${
              activeSessionId === session.id ? "border-amber/60 bg-amber/10" : "border-border bg-surface/80"
            }`}
          >
            <button type="button" onClick={() => onLoadSession(session.id)} className="min-w-0 flex-1 text-left">
              <div className="truncate font-mono text-xs text-ink">{session.title || "New chat"}</div>
              <div className="mt-1 truncate text-[11px] text-muted">
                {new Date(session.updatedAt).toLocaleDateString()} · {session.lastMessage || "Saved conversation"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => onDeleteSession(session.id)}
              className="shrink-0 rounded border border-transparent px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted opacity-80 transition-colors hover:border-risk/60 hover:text-risk"
            >
              Del
            </button>
          </div>
        ))
      )}
    </div>
  </aside>
);

export default AgentChatPanel;
