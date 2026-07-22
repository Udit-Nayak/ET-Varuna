import { useState } from "react";

export type MaritimeRiskPreset =
  | "malacca"
  | "suez"
  | "panama"
  | "hormuz"
  | "english-channel"
  | "bab-el-mandeb"
  | "gibraltar"
  | "bosphorus"
  | "cape-good-hope"
  | "south-china-sea";

interface TensionDrawerProps {
  isDrawing: boolean;
  isEraseMode?: boolean;
  onToggleEraseMode?: () => void;
  onToggleDrawing: () => void;
  onPreset: (preset: MaritimeRiskPreset) => void;
  onClearAll: () => void;
  hasZones: boolean;
}

const PRESETS: Array<{ key: MaritimeRiskPreset; label: string; meta: string }> = [
  { key: "malacca", label: "Strait of Malacca", meta: "ASEAN/China - India/EU" },
  { key: "suez", label: "Suez Canal", meta: "EU - Asia" },
  { key: "panama", label: "Panama Canal", meta: "USMCA - Asia/MERCOSUR" },
  { key: "hormuz", label: "Strait of Hormuz", meta: "Gulf oil exports" },
  { key: "english-channel", label: "English Channel", meta: "EU/transatlantic" },
  { key: "bab-el-mandeb", label: "Bab-el-Mandeb", meta: "Indian Ocean - Suez" },
  { key: "gibraltar", label: "Strait of Gibraltar", meta: "Med - Atlantic" },
  { key: "bosphorus", label: "Bosphorus Strait", meta: "Black Sea - Med" },
  { key: "cape-good-hope", label: "Cape of Good Hope", meta: "Asia - EU/USMCA reroute" },
  { key: "south-china-sea", label: "South China Sea", meta: "ASEAN/East Asia" },
];

const TensionDrawer = ({ isDrawing, isEraseMode = false, onToggleEraseMode, onToggleDrawing, onPreset, onClearAll, hasZones }: TensionDrawerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<MaritimeRiskPreset | "">("");

  return (
    <div className="pointer-events-auto absolute bottom-16 left-3 z-20 flex w-64 flex-col gap-2 font-mono text-xs text-muted">
      <button
        type="button"
        className="flex items-center justify-between rounded-md border border-border bg-surface/95 px-3 py-2.5 text-left text-ink shadow-lg backdrop-blur transition-colors hover:border-amber hover:text-amber"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
      >
        <span className="uppercase tracking-wider">Simulation</span>
        <span className="text-muted">{isOpen ? "▾" : "▸"}</span>
      </button>

      {isOpen && (
        <div className="max-h-[58vh] overflow-y-auto rounded-md border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur">
          <button
            type="button"
            className={
              "mb-2 flex w-full items-center justify-between rounded border px-3 py-2 transition-colors " +
              (isDrawing ? "border-amber bg-amber/10 text-amber" : "border-border text-ink hover:border-amber hover:text-amber")
            }
            onClick={onToggleDrawing}
          >
            <span>{isDrawing ? "Drawing..." : "Draw Tension Zone"}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1 11L11 1M11 1H4M11 1V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            className={
              "mb-2 flex w-full items-center justify-between rounded border px-3 py-2 transition-colors " +
              (isEraseMode
                ? "border-safe bg-safe/10 text-safe"
                : "border-risk/60 text-[#FF8A8A] hover:bg-risk/10")
            }
            onClick={onToggleEraseMode}
            disabled={!hasZones || !onToggleEraseMode}
          >
            <span>{isEraseMode ? "Erase Zone: ON" : "Erase Zone"}</span>
            <span className="h-2 w-2 rounded-full" style={{ background: isEraseMode ? "#3FA796" : "#D64545" }} />
          </button>

          <label className="block border-t border-border pt-2">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Top 10 global risk</div>
            <select
              value={selectedPreset}
              className="w-full rounded border border-border bg-base px-3 py-2 text-ink outline-none transition-colors focus:border-amber"
              onChange={(event) => {
                const nextPreset = event.target.value as MaritimeRiskPreset | "";
                setSelectedPreset(nextPreset);
                if (nextPreset) {
                  onPreset(nextPreset);
                  window.setTimeout(() => setSelectedPreset(""), 0);
                }
              }}
            >
              <option value="">Select chokepoint...</option>
              {PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label} - {preset.meta}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="mt-2 w-full rounded border border-risk/60 px-3 py-2 text-left text-[#FF8A8A] transition-colors hover:bg-risk/10 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onClearAll}
            disabled={!hasZones}
          >
            Clear All Zones
          </button>
        </div>
      )}
    </div>
  );
};

export default TensionDrawer;
