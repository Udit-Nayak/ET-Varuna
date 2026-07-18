interface TensionDrawerProps {
  isDrawing: boolean;
  onToggleDrawing: () => void;
  onPreset: (preset: "hormuz" | "red-sea" | "full-gulf") => void;
  onClearAll: () => void;
  hasZones: boolean;
}

const TensionDrawer = ({
  isDrawing,
  onToggleDrawing,
  onPreset,
  onClearAll,
  hasZones,
}: TensionDrawerProps) => {
  return (
    <div className="pointer-events-auto absolute left-3 top-24 z-20 flex w-44 flex-col gap-2 rounded-md border border-border bg-surface/95 p-2 font-mono text-xs text-muted shadow-lg backdrop-blur">
      <button
        type="button"
        className={`flex items-center justify-between rounded border px-3 py-2 transition-colors ${
          isDrawing
            ? "border-amber bg-amber/10 text-amber"
            : "border-border text-ink hover:border-amber hover:text-amber"
        }`}
        onClick={onToggleDrawing}
      >
        <span>Draw Tension Zone</span>
        <span aria-hidden="true">poly</span>
      </button>

      <div className="border-t border-border pt-2">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Presets</div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="rounded border border-border px-3 py-2 text-left text-ink transition-colors hover:border-amber hover:text-amber"
            onClick={() => onPreset("hormuz")}
          >
            Hormuz Closure
          </button>
          <button
            type="button"
            className="rounded border border-border px-3 py-2 text-left text-ink transition-colors hover:border-amber hover:text-amber"
            onClick={() => onPreset("red-sea")}
          >
            Red Sea Crisis
          </button>
          <button
            type="button"
            className="rounded border border-border px-3 py-2 text-left text-ink transition-colors hover:border-amber hover:text-amber"
            onClick={() => onPreset("full-gulf")}
          >
            Full Gulf Block
          </button>
        </div>
      </div>

      <button
        type="button"
        className="mt-1 rounded border border-[#D64545]/60 px-3 py-2 text-left text-[#FF8A8A] transition-colors hover:bg-[#D64545]/10 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onClearAll}
        disabled={!hasZones}
      >
        Clear All Zones
      </button>
    </div>
  );
};

export default TensionDrawer;
