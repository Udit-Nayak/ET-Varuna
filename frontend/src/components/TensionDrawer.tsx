interface TensionDrawerProps {
  isDrawing: boolean;
  onToggleDrawing: () => void;
  onPreset: (preset: "hormuz" | "red-sea" | "full-gulf") => void;
  onClearAll: () => void;
  hasZones: boolean;
}

const TensionDrawer = ({ isDrawing, onToggleDrawing, onPreset, onClearAll, hasZones }: TensionDrawerProps) => {
  return (
    <div className="pointer-events-auto absolute left-3 top-[13.5rem] z-20 flex w-48 flex-col gap-2 rounded-md border border-border bg-surface/95 p-2.5 font-mono text-xs text-muted shadow-lg backdrop-blur">
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted">Simulation</div>

      <button
        type="button"
        className={`flex items-center justify-between rounded border px-3 py-2 transition-colors ${
          isDrawing ? "border-amber bg-amber/10 text-amber" : "border-border text-ink hover:border-amber hover:text-amber"
        }`}
        onClick={onToggleDrawing}
      >
        <span>{isDrawing ? "Drawing…" : "Draw Tension Zone"}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 11L11 1M11 1H4M11 1V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="border-t border-border pt-2">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Presets</div>
        <div className="flex flex-col gap-1.5">
          {(
            [
              ["hormuz", "Hormuz Closure"],
              ["red-sea", "Red Sea Crisis"],
              ["full-gulf", "Full Gulf Block"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="rounded border border-border px-3 py-2 text-left text-ink transition-colors hover:border-amber hover:text-amber"
              onClick={() => onPreset(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="mt-1 rounded border border-risk/60 px-3 py-2 text-left text-[#FF8A8A] transition-colors hover:bg-risk/10 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onClearAll}
        disabled={!hasZones}
      >
        Clear All Zones
      </button>
    </div>
  );
};

export default TensionDrawer;