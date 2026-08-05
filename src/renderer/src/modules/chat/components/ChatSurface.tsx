import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatSessionPort } from "../ports/ChatSessionPort";
import type { ChatModelsPort } from "../ports/ChatModelsPort";
import type { ChatFilesPort } from "../ports/ChatFilesPort";
import type { ChatNavigationPort } from "../ports/ChatNavigationPort";
import type { ChatCommandPort } from "../ports/ChatCommandPort";
import type { ChatSubmitInput } from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatUsage } from "@shared/chat-runtime/chat-runtime-events";
import { useChatController } from "../controller/useChatController";
import type { ChatRunState } from "../controller/chatViewTypes";
import { MessageList } from "./messages/MessageList";
import { CopilotChatInput } from "./composer/CopilotChatInput";
import { ModelPicker, groupChatModels } from "./composer/ModelPicker";
import { PromptNavigator } from "./navigator/PromptNavigator";
import "../styles/copilot-chat.css";

export type ChatSurfaceSlots = {
  contextBarSlot?: React.ReactNode;
  composerControlsSlot?: React.ReactNode;
  statusBarSlot?: React.ReactNode;
  activeExpertSlot?: React.ReactNode;
  rightPanelSlot?: React.ReactNode;
  attachmentTraySlot?: React.ReactNode;
  filesPanelSlot?: React.ReactNode;
  filesToggleSlot?: React.ReactNode;
  showRightPanel?: boolean;
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
  profileId: string;
  sessionId?: string | null;
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
  onRuntimeCommand?: (command: {
    type: "clarify.respond" | "approval.approve" | "approval.deny";
    requestId: string;
    answer?: string;
    reason?: string;
  }) => void;
};

export function ChatSurface({
  runtime,
  session,
  models,
  files,
  navigation,
  commands,
  profileId,
  sessionId,
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
  filesToggleSlot,
  showRightPanel,
  renderStatusBar,
  onSessionIdChange,
  composeMessage,
  onInputChange,
  onRuntimeCommand,
}: ChatSurfaceProps): React.JSX.Element {
  const {
    state,
    input,
    setInput,
    queue,
    send,
    abort,
    openWeb,
    setSelectedModel,
    addAttachments,
    removeAttachment,
  } = useChatController({
    runtime,
    session,
    models,
    files,
    navigation,
    profileId,
    forcedSessionId: sessionId,
    runId: runIdProp,
    expertId,
    teamId,
    expertRunId,
    workMode,
    permissionMode,
    invocationSource,
    onSessionIdChange,
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

  return (
    <div className={`copilot-chat-root ${className || ""}`.trim()}>
      {activeExpertSlot}
      {statusNode}
      {contextBarSlot}
      <div className="chat-body">
        <div className="chat-main">
          <div className="chat-messages-scroll">
            <MessageList
              messages={state.messages}
              toolProgress={state.toolProgress}
              isBusy={isBusy}
              runId={state.activeRunId}
              onSelectSuggestion={(text) => {
                setInput(text);
                onInputChange?.(text);
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
              onClarifyAnswer={(requestId, answer) =>
                onRuntimeCommand?.({
                  type: "clarify.respond",
                  requestId,
                  answer,
                })
              }
              onApproval={(requestId, approve) =>
                onRuntimeCommand?.({
                  type: approve ? "approval.approve" : "approval.deny",
                  requestId,
                })
              }
            />
            <PromptNavigator
              messages={state.messages}
              runId={state.activeRunId}
              suppressed={rightOpen}
            />
          </div>
          {state.lastError && <div className="chat-error">{state.lastError}</div>}
          {urlHint && (
            <button
              type="button"
              className="chat-open-web"
              onClick={() => openWeb(urlHint)}
            >
              Open in Web Operator
            </button>
          )}
          <CopilotChatInput
            value={input}
            onChange={(v) => {
              setInput(v);
              onInputChange?.(v);
            }}
            onSend={(text) => void send(text)}
            onAbort={() => void abort()}
            isBusy={isBusy}
            attachments={state.attachments}
            onAddAttachments={addAttachments}
            onRemoveAttachment={removeAttachment}
            queue={queue}
            contextUsage={contextUsage}
            files={files}
            commands={commands}
            sessionId={state.activeSessionId}
            profileId={profileId}
            filesToggle={filesToggleSlot}
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
