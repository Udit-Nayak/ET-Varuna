import { PointerEvent as ReactPointerEvent } from "react";

interface SplitDividerProps {
  onPointerDown: (event: ReactPointerEvent) => void;
  isDragging: boolean;
  ratio: number;
}

const SplitDivider = ({ onPointerDown, isDragging, ratio }: SplitDividerProps) => (
  <button
    type="button"
    aria-label="Resize map and chat panels"
    onPointerDown={onPointerDown}
    style={{ left: `${ratio}%` }}
    className={`pointer-events-auto absolute bottom-0 top-0 z-30 w-2 -translate-x-1/2 cursor-col-resize border-x border-border/60 transition-colors ${
      isDragging ? "bg-amber/40" : "bg-surface/80 hover:bg-amber/25"
    }`}
  >
    <span className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/30" />
  </button>
);

export default SplitDivider;
