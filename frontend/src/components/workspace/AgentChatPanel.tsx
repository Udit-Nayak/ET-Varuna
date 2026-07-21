import { FormEvent, useEffect, useRef, useState } from "react";
import AgentChatMessage from "./AgentChatMessage";
import { AgentChatMessageData, AgentWorkflowPayload } from "../../hooks/useAgentWorkflowChat";
import { SimulationImpact, TensionZone } from "../../hooks/useSimulation";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
type AgentTab = "dsm" | "sroa" | "apo";

interface AgentChatPanelProps {
  messages: AgentChatMessageData[];
  latestWorkflow: AgentWorkflowPayload;
  isBusy: boolean;
  compact: boolean;
  zones: TensionZone[];
  impact: SimulationImpact;
  onAskQuestion: (query: string) => void;
  onClear: () => void;
  onAnalyzeZone: (zone: TensionZone) => void;
  onSetTension: (id: string, pct: number) => void;
  onSetDuration: (id: string, days: number) => void;
  onRemoveZone: (id: string) => void;
}

const formatBpd = (value: number) =>
  `${Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 })} BPD`;

const agentMeta: Record<AgentTab, { label: string; color: string; desc: string }> = {
  dsm: { label: "DSM", color: "text-amber border-amber/50", desc: "Disruption simulation and impact timeline" },
  sroa: { label: "SROA", color: "text-safe border-safe/50", desc: "Reserve release policy and safety threshold" },
  apo: { label: "APO", color: "text-muted border-muted/50", desc: "Procurement alternatives and route ranking" },
};

const localSummary = (agent: AgentTab, workflow: AgentWorkflowPayload) => {
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

const AgentOutputView = ({ agent, workflow, compact }: { agent: AgentTab | null; workflow: AgentWorkflowPayload; compact: boolean }) => {
  const [formatted, setFormatted] = useState("");
  const [isFormatting, setIsFormatting] = useState(false);
  const [usedGemini, setUsedGemini] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
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

    fetch(`${API_BASE_URL}/api/chat/format-agent-output`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, payload: workflow }),
    })
      .then(async (response) => {
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
  }, [agent, workflow]);

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center font-mono text-sm text-muted">
        Select DSM, SROA, or APO above to open the full agent output.
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center font-mono text-sm text-muted">
        Run a zone or ask the workflow first. The latest DSM/SROA/APO output will appear here.
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
  compact,
  zones,
  impact,
  onAskQuestion,
  onClear,
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
        <>
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

          <div ref={scrollRef} className={`${compact ? "p-3" : "p-5"} min-h-0 flex-1 space-y-3 overflow-y-auto`}>
            {messages.map((message) => (
              <AgentChatMessage key={message.id} message={message} compact={compact} />
            ))}
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
        </>
      )}
    </aside>
  );
};

export default AgentChatPanel;
