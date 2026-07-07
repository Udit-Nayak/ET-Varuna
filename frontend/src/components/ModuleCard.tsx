import { ModuleMeta } from "../types";

const statusStyles: Record<ModuleMeta["status"], string> = {
  idle: "text-muted border-border",
  monitoring: "text-safe border-safe/40",
  active: "text-amber border-amber/40",
  alert: "text-risk border-risk/40",
};

const statusLabel: Record<ModuleMeta["status"], string> = {
  idle: "Not yet connected",
  monitoring: "Monitoring",
  active: "Active",
  alert: "Alert",
};

const ModuleCard = ({ code, name, description, status }: ModuleMeta) => {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-surface-3">
      <div className="mb-4 flex items-start justify-between">
        <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] tracking-wider text-amber">
          {code}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusStyles[status]}`}
        >
          {statusLabel[status]}
        </span>
      </div>

      <h3 className="font-display text-sm font-semibold text-ink">{name}</h3>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{description}</p>

      <div className="mt-5 flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-base/40">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Module output renders here
        </span>
      </div>
    </div>
  );
};

export default ModuleCard;
