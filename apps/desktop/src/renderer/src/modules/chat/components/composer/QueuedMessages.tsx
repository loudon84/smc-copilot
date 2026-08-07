import { memo, useEffect, useState } from "react";
import { CircleDashed, ChevronRight, ChevronDown, X, Pause, Play, ArrowUp, ArrowDown } from "lucide-react";

export type QueuedComposerMessage = {
  id?: string;
  text: string;
  attachmentsCount?: number;
};

interface QueuedMessagesProps {
  messages: QueuedComposerMessage[];
  onRemove: (index: number) => void;
  onMove?: (index: number, toIndex: number) => void;
  autoDrain?: boolean;
  onToggleAutoDrain?: (enabled: boolean) => void;
}

export const QueuedMessages = memo(function QueuedMessages({
  messages,
  onRemove,
  onMove,
  autoDrain = true,
  onToggleAutoDrain,
}: QueuedMessagesProps): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (messages.length === 0) setExpanded(false);
  }, [messages.length]);

  if (messages.length === 0) return null;

  const preview = (m: QueuedComposerMessage): string => {
    const text = m.text.trim();
    if (text) return text;
    return `${m.attachmentsCount || 0} attachment(s)`;
  };

  const controls = onToggleAutoDrain ? (
    <button
      type="button"
      className="chat-queue-autodrain"
      onClick={() => onToggleAutoDrain(!autoDrain)}
      aria-label={autoDrain ? "Pause auto-drain" : "Resume auto-drain"}
      title={autoDrain ? "Pause auto-drain" : "Resume auto-drain"}
    >
      {autoDrain ? <Pause size={12} /> : <Play size={12} />}
    </button>
  ) : null;

  if (messages.length === 1) {
    return (
      <div className="chat-queue-indicator" data-testid="chat-queue">
        <CircleDashed size={14} className="chat-queue-icon" />
        <span className="chat-queue-single" title={preview(messages[0])}>
          {preview(messages[0])}
        </span>
        {controls}
        <button
          type="button"
          className="chat-queue-remove"
          onClick={() => onRemove(0)}
          aria-label="Cancel queued"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="chat-queue-indicator chat-queue-collapsible"
      data-testid="chat-queue"
    >
      <button
        type="button"
        className="chat-queue-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{messages.length} queued</span>
      </button>
      {controls}
      {expanded && (
        <ul className="chat-queue-list">
          {messages.map((m, i) => (
            <li key={m.id || `${i}-${preview(m).slice(0, 12)}`}>
              <span title={preview(m)}>{preview(m)}</span>
              {onMove ? (
                <span className="chat-queue-reorder">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => onMove(i, i - 1)}
                    aria-label="Move up"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={i >= messages.length - 1}
                    onClick={() => onMove(i, i + 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown size={12} />
                  </button>
                </span>
              ) : null}
              <button type="button" onClick={() => onRemove(i)} aria-label="Remove">
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
