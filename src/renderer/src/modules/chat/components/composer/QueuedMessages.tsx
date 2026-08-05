import { memo, useEffect, useState } from "react";
import { CircleDashed, ChevronRight, ChevronDown, X } from "lucide-react";

export type QueuedComposerMessage = {
  text: string;
  attachmentsCount?: number;
};

interface QueuedMessagesProps {
  messages: QueuedComposerMessage[];
  onRemove: (index: number) => void;
}

export const QueuedMessages = memo(function QueuedMessages({
  messages,
  onRemove,
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

  if (messages.length === 1) {
    return (
      <div className="chat-queue-indicator">
        <CircleDashed size={14} className="chat-queue-icon" />
        <span className="chat-queue-single" title={preview(messages[0])}>
          {preview(messages[0])}
        </span>
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
    <div className="chat-queue-indicator chat-queue-collapsible">
      <button
        type="button"
        className="chat-queue-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{messages.length} queued</span>
      </button>
      {expanded && (
        <ul className="chat-queue-list">
          {messages.map((m, i) => (
            <li key={`${i}-${preview(m).slice(0, 12)}`}>
              <span title={preview(m)}>{preview(m)}</span>
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
