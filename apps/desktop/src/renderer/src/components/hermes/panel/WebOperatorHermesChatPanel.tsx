import { Sparkles, Trash2 } from "lucide-react";
import { DEFAULT_PANEL_SYSTEM_PROMPT } from "../constants";
import { useWebOperatorHermesPanelChat } from "../hooks/useWebOperatorHermesPanelChat";
import { DEFAULT_WEB_OPERATOR_PRESET_ACTIONS } from "../lib/preset-actions";
import type { HermesPanelPageContext, HermesPanelPresetAction, HermesPanelTaskInput, HermesPanelTaskSessionReadyInput } from "../types";
import { WebOperatorHermesPanelComposer } from "./WebOperatorHermesPanelComposer";
import { WebOperatorHermesPanelMessageList } from "./WebOperatorHermesPanelMessageList";
import { WebOperatorHermesPanelToolCard } from "./WebOperatorHermesPanelToolCard";
import "./web-operator-hermes-panel.css";

export function WebOperatorHermesChatPanel({
  pageContext,
  task = null,
  onTaskSessionReady,
  presetActions = DEFAULT_WEB_OPERATOR_PRESET_ACTIONS,
  presetSystemPrompt = DEFAULT_PANEL_SYSTEM_PROMPT,
  className,
}: {
  pageContext: HermesPanelPageContext | null;
  task?: HermesPanelTaskInput | null;
  onTaskSessionReady?: (input: HermesPanelTaskSessionReadyInput) => void;
  presetActions?: HermesPanelPresetAction[];
  presetSystemPrompt?: string;
  className?: string;
}): React.JSX.Element {
  const chat = useWebOperatorHermesPanelChat({
    pageContext: task?.pageContext ?? pageContext,
    task,
    presetSystemPrompt,
    persistenceScopeKey: task ? null : (pageContext?.scopeKey ?? null),
    onTaskSessionReady,
  });

  const hasContext = !!pageContext;
  const summary = pageContext?.summary ?? "未附加页面上下文（可先在 Page Structure 获取 HTML）";
  
  return (
    <div className={`web-operator-hermes-panel${className ? ` ${className}` : ""}`}>
      <header className="web-operator-hermes-panel__header">
        <div className="web-operator-hermes-panel__title">
          <Sparkles size={16} className="shrink-0 text-blue-400" />
          <span className="web-operator-hermes-panel__title-text" title={summary}>
            {summary}
          </span>
        </div>
        {chat.defaultModelLabel ? (
          <p className="web-operator-hermes-panel__meta">模型：{chat.defaultModelLabel}（全局默认）</p>
        ) : null}
        {/*
        <div className="web-operator-hermes-panel__actions">
          <button
            type="button"
            className="web-operator-hermes-panel__btn"
            onClick={chat.clear}
            title="清空会话"
          >
            <Trash2 size={12} style={{ display: "inline", verticalAlign: "middle" }} /> 清空
          </button>
        </div>
        */}
      </header>
      {/*
      {presetActions.length > 0 ? (
        <div className="web-operator-hermes-panel__presets">
          {presetActions.map((a) => (
            <button
              key={a.label}
              type="button"
              className="web-operator-hermes-panel__btn"
              disabled={chat.busy || chat.restoring || !hasContext || task?.action === "pending"}
              onClick={() => void chat.send(a.prompt)}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      */}
      <div className="web-operator-hermes-panel__body">
        {chat.error ? <div className="web-operator-hermes-panel__error">{chat.error}</div> : null}

        {chat.toolCalls.length > 0 ? (
          <div className="web-operator-hermes-panel__tools">
            <div className="web-operator-hermes-panel__tools-label">工具</div>
            {chat.toolCalls.map((tc) => (
              <WebOperatorHermesPanelToolCard key={tc.tid} toolCall={tc} />
            ))}
          </div>
        ) : null}

        {chat.restoring ? (
          <p className="web-operator-hermes-panel__empty">加载历史会话…</p>
        ) : (
          <WebOperatorHermesPanelMessageList
            messages={chat.messages}
            streamingContent={chat.streamingContent}
          />
        )}
      </div>

      <WebOperatorHermesPanelComposer
        busy={chat.busy}
        disabled={chat.restoring || task?.action === "pending"}
        attachments={chat.attachments}
        onUploadAttachment={() => void chat.uploadAttachments()}
        onUploadDroppedAttachments={(files) => void chat.uploadDroppedAttachments(files)}
        onRemoveAttachment={(id) => void chat.removeAttachment(id)}
        onSend={(text) => void chat.send(text)}
        onCancel={() => void chat.cancel()}
      />
    </div>
  );
}
