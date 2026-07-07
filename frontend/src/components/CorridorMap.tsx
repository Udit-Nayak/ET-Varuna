const corridors = [
  { name: "Strait of Hormuz", pct: 88, risk: 82 },
  { name: "Red Sea / Bab-el-Mandeb", pct: 62, risk: 71 },
  { name: "Strait of Malacca", pct: 45, risk: 24 },
  { name: "Suez Canal", pct: 40, risk: 33 },
  { name: "Cape of Good Hope", pct: 18, risk: 9 },
];

const riskColor = (risk: number) => {
  if (risk >= 65) return "bg-risk";
  if (risk >= 35) return "bg-amber";
  return "bg-safe";
};

const CorridorMap = () => {
  return (
    <div className="w-full rounded-lg border border-border bg-surface/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Live corridor risk — India crude imports
        </span>
        <span className="flex items-center gap-2 font-mono text-[11px] text-safe">
          <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-safe" />
          Streaming
        </span>
      </div>

      <div className="space-y-4">
        {corridors.map((c) => (
          <div key={c.name}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-mono text-xs text-ink">{c.name}</span>
              <span className="font-mono text-xs text-muted">
                risk <span className="text-ink">{c.risk}</span>/100 · {c.pct}% of import volume
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${riskColor(c.risk)} transition-all duration-700`}
                style={{ width: `${c.risk}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-border pt-3 font-mono text-[10px] leading-relaxed text-muted">
        Illustrative demo data. Live figures are produced by GRIA from news, AIS, sanctions, and
        price feeds once connected.
      </p>
    </div>
  );
};

export default CorridorMap;
