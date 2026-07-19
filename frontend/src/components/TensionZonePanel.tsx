import { AgentZoneAnalysis, SimulationImpact, TensionZone, ZoneImpact } from "../hooks/useSimulation";

interface TensionZonePanelProps {
  zones: TensionZone[];
  impact: SimulationImpact;
  agentAnalyses: Record<string, AgentZoneAnalysis>;
  onAnalyzeZone: (zone: TensionZone) => void;
  onSetTension: (id: string, pct: number) => void;
  onSetDuration: (id: string, days: number) => void;
  onRemoveZone: (id: string) => void;
}

const corridorLabel = (corridorId: string | null) => {
  const labels: Record<string, string> = {
    hormuz: "Strait of Hormuz",
    "bab-el-mandeb": "Bab-el-Mandeb",
    malacca: "Strait of Malacca",
    suez: "Suez Canal",
    "persian-gulf": "Persian Gulf",
  };

  return corridorId ? labels[corridorId] ?? corridorId : "No corridor match";
};

const metricColor = (tone: "red" | "amber" | "green") => {
  if (tone === "red") return "border-[#D64545]/70 text-[#FF8A8A]";
  if (tone === "amber") return "border-amber/70 text-amber";
  return "border-[#3FA796]/70 text-[#8FF0C2]";
};

type MetricTone = "red" | "amber" | "green";

const volumeTone = (value: number): MetricTone => {
  if (value > 500000) return "red";
  if (value > 200000) return "amber";
  return "green";
};

const sprTone = (value: number): MetricTone => {
  if (value < 5) return "red";
  if (value < 8) return "amber";
  return "green";
};

const priceTone = (value: number): MetricTone => {
  if (value > 15) return "red";
  if (value > 8) return "amber";
  return "green";
};

const formatBpd = (value: number) =>
  `${Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 })} BPD`;

const getZoneImpact = (impact: SimulationImpact, zoneId: string): ZoneImpact | undefined =>
  impact.perZone.find((item) => item.zoneId === zoneId);

const TensionZonePanel = ({
  zones,
  impact,
  agentAnalyses,
  onAnalyzeZone,
  onSetTension,
  onSetDuration,
  onRemoveZone,
}: TensionZonePanelProps) => {
  const hormuzAffected = zones.some(
    (zone) => zone.corridorId === "hormuz" || zone.corridorId === "persian-gulf"
  );
  const redSeaAffected = zones.some((zone) => zone.corridorId === "bab-el-mandeb");
  const sprDays = impact.minSprDaysRemaining.toFixed(1);

  return (
    <aside
className={`pointer-events-auto absolute right-3 top-3 z-20 max-h-[calc(100%-1.5rem)] w-80 overflow-y-auto rounded-md border border-border bg-surface/95 p-3 font-mono text-xs text-muted shadow-lg backdrop-blur transition-transform duration-300 ${
        zones.length > 0 ? "translate-x-0" : "translate-x-[calc(100%+1.5rem)]"
      }`}
    >
      <section>
        <div className="mb-3 font-display text-sm font-semibold text-ink">
          Active Tension Zones
        </div>
        <div className="space-y-3">
          {zones.map((zone) => (
            <div key={zone.id} className="rounded border border-border bg-base/70 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">{zone.name}</div>
                  <div>{corridorLabel(zone.corridorId)}</div>
                </div>
                <button
                  type="button"
                  className="rounded border border-[#D64545]/60 px-2 py-1 text-[10px] text-[#FF8A8A] hover:bg-[#D64545]/10"
                  onClick={() => onRemoveZone(zone.id)}
                >
                  Delete
                </button>
              </div>

              <label className="mb-2 block">
                <div className="mb-1 flex justify-between">
                  <span>Tension intensity</span>
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

              <label className="block">
                <div className="mb-1">Duration days</div>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={zone.durationDays}
                  className="w-full rounded border border-border bg-base px-2 py-1 text-ink outline-none focus:border-amber"
                  onChange={(event) => onSetDuration(zone.id, Number(event.target.value))}
                />
              </label>

              <button
                type="button"
                className="mt-3 w-full rounded border border-amber/70 px-3 py-2 text-left text-amber transition-colors hover:bg-amber/10 disabled:cursor-wait disabled:opacity-60"
                disabled={agentAnalyses[zone.id]?.status === "loading"}
                onClick={() => onAnalyzeZone(zone)}
              >
                {agentAnalyses[zone.id]?.status === "loading" ? "Agents analyzing..." : "Run GRIA + DSM + SROA"}
              </button>

              <AgentAnalysisBlock analysis={agentAnalyses[zone.id]} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 border-t border-border pt-4">
        <div className="mb-3 font-display text-sm font-semibold text-ink">Impact Estimates</div>
        <div className="grid grid-cols-1 gap-2">
          <div
            className={`rounded border bg-base/70 p-3 ${metricColor(
              volumeTone(impact.totalVolumeAtRisk)
            )}`}
          >
            <div className="text-muted">Volume at risk</div>
            <div className="text-lg font-semibold">{formatBpd(impact.totalVolumeAtRisk)}</div>
          </div>
          <div
            className={`rounded border bg-base/70 p-3 ${metricColor(
              sprTone(impact.minSprDaysRemaining)
            )}`}
          >
            <div className="text-muted">SPR days remaining</div>
            <div className="text-lg font-semibold">{impact.minSprDaysRemaining.toFixed(1)}</div>
          </div>
          <div
            className={`rounded border bg-base/70 p-3 ${metricColor(
              priceTone(impact.totalPriceImpactPct)
            )}`}
          >
            <div className="text-muted">Price impact</div>
            <div className="text-lg font-semibold">
              {impact.totalPriceImpactPct.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {zones.map((zone) => {
            const zoneImpact = getZoneImpact(impact, zone.id);
            if (!zoneImpact) return null;

            return (
              <div key={zone.id} className="rounded border border-border bg-base/50 p-2">
                <div className="font-semibold text-ink">{zone.name}</div>
                <div>{formatBpd(zoneImpact.volumeAtRisk)} at risk</div>
                <div>{zoneImpact.priceImpactPct.toFixed(1)}% price pressure</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-4 border-t border-border pt-4">
        <div className="mb-3 font-display text-sm font-semibold text-ink">
          Procurement Alternatives
        </div>
        <div className="space-y-2">
          {hormuzAffected && (
            <>
              <div>→ Reroute via Cape of Good Hope (+14 days, +$4.2/bbl)</div>
              <div>→ Activate SPR drawdown (covers {sprDays} days)</div>
            </>
          )}
          {redSeaAffected && (
            <>
              <div>→ Reroute via Suez Canal Cape bypass (+12 days)</div>
              <div>→ Alternative suppliers: US WTI (+$6/bbl premium)</div>
            </>
          )}
          <div>→ Accelerate Russian non-Hormuz imports (Vladivostok route)</div>
        </div>
      </section>
    </aside>
  );
};

const formatVolume = (value: number) =>
  `${Math.round(value).toLocaleString("en-US", { maximumFractionDigits: 0 })} bbl`;

const AgentAnalysisBlock = ({ analysis }: { analysis?: AgentZoneAnalysis }) => {
  if (!analysis) {
    return <div className="mt-3 rounded border border-border/70 bg-base/50 p-2 text-ink/60">Agent output pending</div>;
  }

  if (analysis.status === "loading") {
    return <div className="mt-3 rounded border border-amber/40 bg-amber/10 p-2 text-amber">{analysis.message}</div>;
  }

  if (analysis.status === "error") {
    return <div className="mt-3 rounded border border-risk/60 bg-risk/10 p-2 text-[#FF8A8A]">{analysis.message}</div>;
  }

  return (
    <div className="mt-3 space-y-2 rounded border border-border/80 bg-base/60 p-2">
      <div className="font-semibold text-ink">Agent Result</div>
      <div>GRIA matches: <span className="text-ink">{analysis.griaMatches ?? 0}</span></div>
      {analysis.dsm && (
        <div>
          DSM: <span className="text-ink">{analysis.dsm.capacityLossPct}%</span> loss /{" "}
          <span className="text-ink">{analysis.dsm.durationDays}d</span>
        </div>
      )}
      {analysis.sroa && (
        <>
          <div>
            SROA: <span className="text-ink">{analysis.sroa.policy}</span>, release{" "}
            <span className="text-ink">{formatVolume(analysis.sroa.totalReleasedVolume)}</span>
          </div>
          <div>
            Reserve after: <span className="text-ink">{analysis.sroa.reserveAfterPlanDays.toFixed(2)} days</span>
          </div>
          <div className={analysis.sroa.safetyThresholdBreached ? "text-[#FF8A8A]" : "text-[#8FF0C2]"}>
            {analysis.sroa.safetyThresholdBreached ? "Safety threshold breached" : "Safety threshold protected"}
          </div>
        </>
      )}
      {analysis.recommendation && <div className="border-t border-border/70 pt-2 text-ink">{analysis.recommendation}</div>}
    </div>
  );
};

export default TensionZonePanel;
