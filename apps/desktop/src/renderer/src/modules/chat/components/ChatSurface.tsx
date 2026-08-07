import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatSessionPort } from "../ports/ChatSessionPort";
import type { ChatModelsPort } from "../ports/ChatModelsPort";
import type { ChatFilesPort } from "../ports/ChatFilesPort";
import type { ChatNavigationPort } from "../ports/ChatNavigationPort";
import type { ChatCommandPort } from "../ports/ChatCommandPort";
import type { ChatRunContextPort } from "../ports/ChatRunContextPort";
import type { ChatSubmitInput } from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatUsage } from "@shared/chat-runtime/chat-runtime-events";
import { useChatController } from "../controller/useChatController";
import type { ChatRunState } from "../controller/chatViewTypes";
import { MessageList } from "./messages/MessageList";
import { CopilotChatInput } from "./composer/CopilotChatInput";
import { ModelPicker, groupChatModels } from "./composer/ModelPicker";
import { ChatFloatingRail } from "./floating/ChatFloatingRail";
import { ChatContentRail } from "../layout/ChatContentRail";
import { ChatRuntimeRecoveryBridge } from "../recovery/ChatRuntimeRecoveryBridge";
import { ChatDiagnosticsExportButton } from "./diagnostics/ChatDiagnosticsExportButton";
import "../styles/copilot-chat.css";

export type ControllerStateChangeSnapshot = {
  runId: string;
  sessionId: string | null;
  runState: ChatRunState;
  selectedModelId: string | null;
  usage: ChatUsage | null;
  firstUserPrompt?: string;
};

export type ChatSurfaceSlots = {
  contextBarSlot?: React.ReactNode;
  composerControlsSlot?: React.ReactNode;
  statusBarSlot?: React.ReactNode;
  activeExpertSlot?: React.ReactNode;
  rightPanelSlot?: React.ReactNode;
  attachmentTraySlot?: React.ReactNode;
  filesPanelSlot?: React.ReactNode;
  /** @deprecated Session Files toggle moved to ChatFloatingRail. */
  filesToggleSlot?: React.ReactNode;
  showRightPanel?: boolean;
  sessionFilesActive?: boolean;
  sessionFilesCount?: number;
  onToggleSessionFiles?: () => void;
  emptyContext?: {
    expertName?: string;
    teamName?: string;
    description?: string;
    suggestions?: Array<{ text: string; label?: string }>;
  };
  renderStatusBar?: (ctx: {
    runState: ChatRunState;
    toolProgress: string | null;
    durationMs: number;
    usage: ChatUsage | null;
  }) => React.ReactNode;
};

export type ChatSurfaceProps = ChatSurfaceSlots & {
  runtime: ChatRuntimePort;
  session?: ChatSessionPort;
  models?: ChatModelsPort;
  files?: ChatFilesPort;
  navigation?: ChatNavigationPort;
  commands?: ChatCommandPort;
  runContext?: ChatRunContextPort;
  profileId: string;
  /** Mount-time session id for one-shot history hydrate (not runtime bind). */
  sessionId?: string | null;
  initialDraft?: string;
  expertId?: string;
  teamId?: string;
  expertRunId?: string;
  workMode?: string;
  permissionMode?: "default" | "ask_each_time";
  invocationSource?: ChatSubmitInput["invocationSource"];
  runId?: string;
  className?: string;
  onSessionIdChange?: (sessionId: string | null) => void;
  composeMessage?: (raw: string) => string | Promise<string>;
  onInputChange?: (value: string) => void;
  onControllerStateChange?: (snapshot: ControllerStateChangeSnapshot) => void;
  onRuntimeCommand?: (command: {
    type: "clarify.respond" | "approval.approve" | "approval.deny";
    requestId: string;
    turnId?: string;
    answer?: string;
    reason?: string;
  }) => void;
  skillName?: string;
  promptHintMode?: "auto" | "custom" | "disabled";
};

export function ChatSurface({
  runtime,
  session,
  models,
  files,
  navigation,
  commands,
  runContext,
  profileId,
  sessionId,
  initialDraft,
  expertId,
  teamId,
  expertRunId,
  workMode,
  permissionMode,
  invocationSource,
  runId: runIdProp,
  className,
  contextBarSlot,
  composerControlsSlot,
  statusBarSlot,
  activeExpertSlot,
  rightPanelSlot,
  filesPanelSlot,
  showRightPanel,
  sessionFilesActive,
  sessionFilesCount,
  onToggleSessionFiles,
  emptyContext,
  renderStatusBar,
  onSessionIdChange,
  composeMessage,
  onInputChange,
  onControllerStateChange,
  onRuntimeCommand,
  skillName,
  promptHintMode,
}: ChatSurfaceProps): React.JSX.Element {
  const {
    state,
    input,
    setInput,
    submitComposer,
    submitPayload,
    submitRuntimeCommand,
    retryLastTurn,
    retryTurn,
    editAndRetryLastTurn,
    editAndRetryTurn,
    retryLastTurnWithCurrentContext,
    retryTurnWithCurrentContext,
    abort,
    openWeb,
    setSelectedModel,
    addAttachments,
    removeAttachment,
    queue,
    seedLastAppliedSequence,
    ingestRuntimeEvent,
  } = useChatController({
    runtime,
    session,
    models,
    files,
    navigation,
    profileId,
    initialSessionId: sessionId,
    initialDraft,
    runId: runIdProp,
    expertId,
    teamId,
    expertRunId,
    skillName,
    workMode,
    permissionMode,
    promptHintMode,
    invocationSource,
    runContext,
    onSessionIdChange,
    onDraftChange: onInputChange,
    composeMessage,
  });

  const [modelOptions, setModelOptions] = useState<
    Array<{
      id: string;
      label: string;
      provider?: string | null;
      model: string;
      baseUrl?: string | null;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!models?.listModels) return;
      try {
        const list = await models.listModels(profileId);
        if (cancelled) return;
        setModelOptions(
          list.map((m) => ({
            id: m.id,
            label: m.label || m.id,
            provider: m.provider,
            model: m.model,
            baseUrl: m.baseUrl,
          })),
        );
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [models, profileId]);

  const modelGroups = useMemo(
    () => groupChatModels(modelOptions),
    [modelOptions],
  );

  const isBusy =
    state.runState === "streaming" ||
    state.runState === "creating" ||
    state.runState === "waiting_approval" ||
    state.runState === "waiting_clarify";

  const firstUserPrompt = useMemo(() => {
    const first = state.messages.find((m) => m.kind === "user");
    return first && first.kind === "user" ? first.content : undefined;
  }, [state.messages]);

  useEffect(() => {
    if (!onControllerStateChange) return;
    onControllerStateChange({
      runId: state.activeRunId,
      sessionId: state.activeSessionId,
      runState: state.runState,
      selectedModelId: state.selectedModelId,
      usage: state.usage,
      firstUserPrompt,
    });
  }, [
    firstUserPrompt,
    onControllerStateChange,
    state.activeRunId,
    state.activeSessionId,
    state.runState,
    state.selectedModelId,
    state.usage,
  ]);

  const pendingClarify = useMemo(
    () =>
      [...state.messages]
        .reverse()
        .find((m) => m.kind === "clarify" && !m.resolved),
    [state.messages],
  );
  const pendingApproval = useMemo(
    () => [...state.messages].reverse().find((m) => m.kind === "approval"),
    [state.messages],
  );

  const urlHint = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const m = state.messages[i];
      if (m.kind === "tool_call") {
        const match = `${m.name} ${m.args}`.match(/https?:\/\/\S+/);
        if (match) return match[0];
      }
      if (m.kind === "tool_result") {
        const match = `${m.name} ${m.content}`.match(/https?:\/\/\S+/);
        if (match) return match[0];
      }
      if (m.kind === "assistant") {
        const match = m.content.match(/https?:\/\/\S+/);
        if (match) return match[0];
      }
    }
    return undefined;
  }, [state.messages]);

  const contextUsage = state.usage
    ? {
        used: state.usage.contextTokens ?? state.usage.promptTokens,
        window: state.usage.contextWindowTokens ?? 128000,
        cacheReadTokens: state.usage.cacheReadTokens,
        cacheWriteTokens: state.usage.cacheWriteTokens,
      }
    : null;

  const statusNode = renderStatusBar
    ? renderStatusBar({
        runState: state.runState,
        toolProgress: state.toolProgress,
        durationMs: 0,
        usage: state.usage,
      })
    : statusBarSlot;

  const rightOpen = showRightPanel === true;

  const handleSuggestion = useCallback(
    (text: string) => {
      setInput(text);
      onInputChange?.(text);
    },
    [onInputChange, setInput],
  );

  return (
    <div className={`copilot-chat-root ${className || ""}`.trim()}>
      <ChatRuntimeRecoveryBridge
        runtime={runtime}
        runId={state.activeRunId || runIdProp || ""}
        profileId={profileId}
        onReplayEvent={ingestRuntimeEvent}
        onSeedSequence={seedLastAppliedSequence}
      />
      {activeExpertSlot}
      {statusNode}
      {contextBarSlot}
      <div className="chat-diagnostics-bar">
        <ChatDiagnosticsExportButton
          runtime={runtime}
          runId={state.activeRunId || runIdProp || ""}
        />
      </div>
      <div className="chat-body">
        <div className="chat-main">
          <div className="chat-messages-scroll">
            <ChatContentRail>
              <MessageList
                messages={state.messages}
                toolProgress={state.toolProgress}
                isBusy={isBusy}
                runId={state.activeRunId}
                emptyContext={emptyContext}
                onSelectSuggestion={handleSuggestion}
                onRetry={(turnId) => {
                  if (turnId) void retryTurn(turnId);
                  else void retryLastTurn();
                }}
                onEditRetry={(turnId) => {
                  if (turnId) void editAndRetryTurn(turnId);
                  else editAndRetryLastTurn();
                }}
                onRetryWithCurrentContext={(turnId) => {
                  if (turnId) void retryTurnWithCurrentContext(turnId);
                  else void retryLastTurnWithCurrentContext();
                }}
                pendingClarifyRequestId={
                  pendingClarify?.kind === "clarify"
                    ? pendingClarify.request.requestId
                    : null
                }
                pendingApprovalRequestId={
                  pendingApproval?.kind === "approval"
                    ? pendingApproval.request.requestId
                    : null
                }
                onClarifyAnswer={(requestId, answer) => {
                  void submitRuntimeCommand({
                    type: "clarify.respond",
                    requestId,
                    answer,
                  });
                }}
                onClarifyRetry={(requestId, answer) => {
                  void submitRuntimeCommand({
                    type: "clarify.respond",
                    requestId,
                    answer,
                  });
                }}
                onApproval={(requestId, approve, reason) => {
                  void submitRuntimeCommand(
                    approve
                      ? { type: "approval.approve", requestId }
                      : { type: "approval.deny", requestId, reason },
                  );
                }}
                onApprovalRetry={(requestId) => {
                  const pending = state.messages.find(
                    (m) =>
                      m.kind === "approval" &&
                      m.request.requestId === requestId,
                  );
                  void submitRuntimeCommand(
                    pending?.kind === "approval" && pending.decision === "denied"
                      ? {
                          type: "approval.deny",
                          requestId,
                          reason: pending.denyReason,
                        }
                      : { type: "approval.approve", requestId },
                  );
                }}
              />
            </ChatContentRail>
          </div>
          {state.lastError && (
            <ChatContentRail>
              <div className="chat-error">{state.lastError}</div>
            </ChatContentRail>
          )}
          {urlHint && (
            <ChatContentRail>
              <button
                type="button"
                className="chat-open-web"
                onClick={() => openWeb(urlHint)}
              >
                Open in Web Operator
              </button>
            </ChatContentRail>
          )}
          <ChatContentRail className="chat-composer-rail">
            <CopilotChatInput
              value={input}
              onChange={(v) => {
                setInput(v);
                onInputChange?.(v);
              }}
              onSend={() => void submitComposer()}
              onAbort={() => void abort()}
              isBusy={isBusy}
              attachments={state.attachments}
              onAddAttachments={addAttachments}
              onRemoveAttachment={removeAttachment}
              queue={queue.map((q) => ({
                text: q.snapshot.rawText,
                attachmentsCount: q.snapshot.attachments.length,
              }))}
              contextUsage={contextUsage}
              files={files}
              commands={commands}
              sessionId={state.activeSessionId}
              profileId={profileId}
              toolbarExtras={
                <>
                  {composerControlsSlot}
                  <ModelPicker
                    groups={modelGroups}
                    selectedModelId={state.selectedModelId}
                    onSelect={(id) => {
                      setSelectedModel(id || null);
                      void models?.setSessionModel?.(
                        state.activeSessionId || "draft",
                        id,
                        profileId,
                      );
                    }}
                    disabled={isBusy}
                  />
                </>
              }
            />
          </ChatContentRail>
          <ChatFloatingRail
            messages={state.messages}
            runId={state.activeRunId}
            sessionFiles={{
              count: sessionFilesCount ?? 0,
              active: sessionFilesActive === true,
              disabled:
                !state.activeSessionId &&
                state.attachments.length === 0 &&
                (sessionFilesCount ?? 0) === 0,
              onToggle: () => onToggleSessionFiles?.(),
            }}
          />
        </div>
        {rightOpen && (
          <aside className="chat-right-panel">
            {filesPanelSlot}
            {rightPanelSlot}
          </aside>
        )}
      </div>
    </div>
  );
}

export default ChatSurface;
