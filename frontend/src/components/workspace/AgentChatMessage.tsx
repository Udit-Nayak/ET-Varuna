import { AgentChatMessageData } from "../../hooks/useAgentWorkflowChat";

interface AgentChatMessageProps {
  message: AgentChatMessageData;
  compact: boolean;
}

const roleMeta: Record<AgentChatMessageData["role"], { label: string; cls: string }> = {
  system: { label: "SYSTEM", cls: "border-ink/30 text-ink" },
  gria: { label: "GRIA", cls: "border-ink/30 text-ink" },
  dsm: { label: "DSM", cls: "border-amber/50 text-amber" },
  sroa: { label: "SROA", cls: "border-safe/50 text-safe" },
  apo: { label: "APO", cls: "border-muted/50 text-muted" },
  user: { label: "YOU", cls: "border-amber/50 text-amber" },
};

const formatTime = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const AgentChatMessage = ({ message, compact }: AgentChatMessageProps) => {
  const meta = roleMeta[message.role];
  const isUser = message.role === "user";
  const statusClass =
    isUser
      ? "border-amber/60 bg-amber/10"
      : message.status === "error"
      ? "border-risk/60 bg-risk/10"
      : message.status === "streaming"
      ? "border-amber/50 bg-amber/10"
      : "border-border bg-base/70";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`${compact ? "max-w-[92%] p-2.5 text-xs" : isUser ? "max-w-[72%] p-3 text-sm" : "max-w-[92%] p-3 text-sm"} rounded-md border ${statusClass} text-muted`}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className={`rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider ${meta.cls}`}>{meta.label}</span>
          <span className="font-mono text-[10px] text-muted">{formatTime(message.timestamp)}</span>
        </div>
        <div className="whitespace-pre-wrap leading-relaxed text-ink/90">{message.content}</div>
        {message.status === "streaming" && (
          <div className="mt-2 flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-amber" />
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-amber [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-amber [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentChatMessage;
