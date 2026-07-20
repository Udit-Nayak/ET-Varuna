import { FormEvent, useEffect, useRef, useState } from "react";
import AgentChatMessage from "./AgentChatMessage";
import { AgentChatMessageData } from "../../hooks/useAgentWorkflowChat";
import { SimulationImpact, TensionZone } from "../../hooks/useSimulation";

interface AgentChatPanelProps {
  messages: AgentChatMessageData[];
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

const AgentChatPanel = ({
  messages,
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
            <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">Live response chat</h2>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber hover:text-amber"
          >
            Clear
          </button>
        </div>
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
      </div>

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
    </aside>
  );
};

export default AgentChatPanel;
