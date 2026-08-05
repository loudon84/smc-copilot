import { memo, useState } from "react";
import { useI18n } from "@renderer/components/useI18n";
import type { ChatViewItem } from "../../controller/chatViewTypes";

const SKIP_ANSWER = "";

type ClarifyMsg = Extract<ChatViewItem, { kind: "clarify" }>;

interface ClarifyCardProps {
  msg: ClarifyMsg;
  onResolved: (requestId: string, answer: string) => void;
}

/**
 * Inline clarify card — answers go through Host → chatRuntime.command,
 * never window.hermesAPI from Chat Core.
 */
export const ClarifyCard = memo(function ClarifyCard({
  msg,
  onResolved,
}: ClarifyCardProps): React.JSX.Element {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const resolved = !!msg.resolved;
  const choices = msg.request.choices || [];

  const submit = (answer: string): void => {
    if (resolved || submitting) return;
    setSubmitting(true);
    try {
      onResolved(msg.request.requestId, answer);
    } finally {
      setSubmitting(false);
    }
  };

  if (resolved) {
    return (
      <div className="chat-clarify chat-clarify--resolved">
        <div className="chat-clarify-question">{msg.request.question}</div>
        <div className="chat-clarify-answer">
          {msg.answer && msg.answer.trim()
            ? msg.answer
            : t("chat.clarify.skipped")}
        </div>
      </div>
    );
  }

  const hasChoices = choices.length > 0;

  return (
    <div className="chat-clarify">
      <div className="chat-clarify-question">
        {msg.request.question || t("chat.clarify.defaultQuestion")}
      </div>
      {hasChoices ? (
        <div className="chat-clarify-choices">
          {choices.map((choice, i) => (
            <button
              key={`${msg.request.requestId}-${i}`}
              type="button"
              className="chat-clarify-choice"
              disabled={submitting}
              onClick={() => submit(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      ) : (
        <div className="chat-clarify-open">
          <textarea
            className="chat-clarify-textarea"
            rows={3}
            value={text}
            placeholder={t("chat.clarify.placeholder")}
            disabled={submitting}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit(text);
              }
            }}
          />
          <button
            type="button"
            className="chat-clarify-submit"
            disabled={submitting || !text.trim()}
            onClick={() => submit(text)}
          >
            {t("chat.clarify.submit")}
          </button>
        </div>
      )}
      <button
        type="button"
        className="chat-clarify-skip"
        disabled={submitting}
        onClick={() => submit(SKIP_ANSWER)}
      >
        {t("chat.clarify.skip")}
      </button>
    </div>
  );
});
