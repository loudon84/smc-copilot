import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatRuntimePort } from "../ports/ChatRuntimePort";
import type { ChatSessionPort } from "../ports/ChatSessionPort";
import type { ChatModelsPort } from "../ports/ChatModelsPort";
import type { ChatFilesPort } from "../ports/ChatFilesPort";
import type { ChatNavigationPort } from "../ports/ChatNavigationPort";
import type { ChatSubmitInput } from "@shared/chat-runtime/chat-runtime-contract";
import type { ChatUsage } from "@shared/chat-runtime/chat-runtime-events";
import { useChatController } from "../controller/useChatController";
import type { ChatRunState } from "../controller/chatViewTypes";
import { MessageList } from "./messages/MessageList";
import { ChatComposer } from "./composer/ChatComposer";
import { ModelPicker } from "./composer/ModelPicker";
import "../styles/copilot-chat.css";

export type ChatSurfaceSlots = {
  contextBarSlot?: React.ReactNode;
  composerControlsSlot?: React.ReactNode;
  statusBarSlot?: React.ReactNode;
  activeExpertSlot?: React.ReactNode;
  rightPanelSlot?: React.ReactNode;
  attachmentTraySlot?: React.ReactNode;
  filesPanelSlot?: React.ReactNode;
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
  onRuntimeCommand?: (command: {
    type: "clarify.respond" | "approval.approve" | "approval.deny";
    requestId: string;
    answer?: string;
    reason?: string;
  }) => void;
};

/**
 * Copilot Chat Surface — Controller + production MessageList/Composer.
 */
export function ChatSurface({
  runtime,
  session,
  models,
  files,
  navigation,
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
  attachmentTraySlot,
  filesPanelSlot,
  renderStatusBar,
  onSessionIdChange,
  composeMessage,
  onRuntimeCommand,
}: ChatSurfaceProps): React.JSX.Element {
  const {
    state,
    input,
    setInput,
    queueLength,
    send,
    abort,
    openWeb,
    setSelectedModel,
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
    Array<{ id: string; label: string }>
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

  const isBusy =
    state.runState === "streaming" ||
    state.runState === "creating" ||
    state.runState === "waiting_approval" ||
    state.runState === "waiting_clarify";

  const handleSend = useCallback(() => {
    void send();
  }, [send]);

  const handleAbort = useCallback(() => {
    void abort();
  }, [abort]);

  const urlHint = useMemo(() => {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const m = state.messages[i];
      if (m.kind === "tool_call" || m.kind === "tool_result") {
        const text = `${m.event.label || ""} ${m.event.preview || ""} ${m.event.result || ""}`;
        const match = text.match(/https?:\/\/\S+/);
        if (match) return match[0];
      }
      if (m.kind === "assistant") {
        const match = m.content.match(/https?:\/\/\S+/);
        if (match) return match[0];
      }
    }
    return undefined;
  }, [state.messages]);

  const statusNode = renderStatusBar
    ? renderStatusBar({
        runState: state.runState,
        toolProgress: state.toolProgress,
        durationMs: 0,
        usage: state.usage,
      })
    : statusBarSlot;

  return (
    <div className={`copilot-chat-root ${className || ""}`.trim()}>
      {activeExpertSlot}
      {statusNode}
      {contextBarSlot}
      <div className="chat-body">
        <div className="chat-main">
          <MessageList
            messages={state.messages}
            toolProgress={state.toolProgress}
            isBusy={isBusy}
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
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onAbort={handleAbort}
            isBusy={isBusy}
            composerControlsSlot={composerControlsSlot}
            attachmentTraySlot={attachmentTraySlot}
            queueLength={queueLength}
            modelPickerSlot={
              <ModelPicker
                models={modelOptions}
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
            }
          />
        </div>
        {(rightPanelSlot || filesPanelSlot) && (
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
