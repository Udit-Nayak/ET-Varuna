import { RefObject } from "react";
import SplitDivider from "./SplitDivider";
import AgentChatPanel from "./AgentChatPanel";
import { useSplitRatio } from "../../hooks/useSplitRatio";
import { AgentChatMessageData, AgentWorkflowPayload, ChatSessionSummary } from "../../hooks/useAgentWorkflowChat";
import { SimulationImpact, TensionZone } from "../../hooks/useSimulation";

interface SplitWorkspaceProps {
  containerRef: RefObject<HTMLDivElement>;
  ratio: number;
  isDragging: boolean;
  onDividerPointerDown: ReturnType<typeof useSplitRatio>["onPointerDown"];
  stackedLayout?: boolean;
  chatCompact: boolean;
  messages: AgentChatMessageData[];
  latestWorkflow: AgentWorkflowPayload;
  isBusy: boolean;
  isSaving: boolean;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  historyOpen: boolean;
  isHistoryLoading: boolean;
  zones: TensionZone[];
  impact: SimulationImpact;
  onAskQuestion: (query: string) => void;
  onClearChat: () => void;
  onToggleHistory: () => void;
  onStartNewChat: () => void;
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onAnalyzeZone: (zone: TensionZone) => void;
  onSetTension: (id: string, pct: number) => void;
  onSetDuration: (id: string, days: number) => void;
  onRemoveZone: (id: string) => void;
}

const SplitWorkspace = ({
  containerRef,
  ratio,
  isDragging,
  onDividerPointerDown,
  stackedLayout = false,
  chatCompact,
  messages,
  latestWorkflow,
  isBusy,
  isSaving,
  sessions,
  activeSessionId,
  historyOpen,
  isHistoryLoading,
  zones,
  impact,
  onAskQuestion,
  onClearChat,
  onToggleHistory,
  onStartNewChat,
  onLoadSession,
  onDeleteSession,
  onAnalyzeZone,
  onSetTension,
  onSetDuration,
  onRemoveZone,
}: SplitWorkspaceProps) => (
  <div
    ref={containerRef}
    className="pointer-events-none relative h-[calc(100dvh-65px)] w-full overflow-hidden bg-transparent text-ink"
  >
    {!stackedLayout && <div className="pointer-events-none h-full" style={{ width: `${ratio}%` }} />}
    {!stackedLayout && <SplitDivider onPointerDown={onDividerPointerDown} isDragging={isDragging} ratio={ratio} />}
    <div
      className={stackedLayout ? "absolute bottom-0 left-0 right-0 top-[42dvh]" : "absolute bottom-0 right-0 top-0"}
      style={stackedLayout ? undefined : { left: `${ratio}%` }}
    >
      <AgentChatPanel
        messages={messages}
        latestWorkflow={latestWorkflow}
        isBusy={isBusy}
        isSaving={isSaving}
        sessions={sessions}
        activeSessionId={activeSessionId}
        historyOpen={historyOpen}
        isHistoryLoading={isHistoryLoading}
        compact={chatCompact}
        zones={zones}
        impact={impact}
        onAskQuestion={onAskQuestion}
        onClear={onClearChat}
        onToggleHistory={onToggleHistory}
        onStartNewChat={onStartNewChat}
        onLoadSession={onLoadSession}
        onDeleteSession={onDeleteSession}
        onAnalyzeZone={onAnalyzeZone}
        onSetTension={onSetTension}
        onSetDuration={onSetDuration}
        onRemoveZone={onRemoveZone}
        stackedLayout={stackedLayout}
      />
    </div>
  </div>
);

export default SplitWorkspace;
