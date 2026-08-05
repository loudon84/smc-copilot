import type { ClarifyRequest } from "@shared/chat-runtime/chat-runtime-events";

export function ClarifyCard(props: {
  request: ClarifyRequest;
  onAnswer?: (requestId: string, answer: string) => void;
}): React.JSX.Element {
  const { request, onAnswer } = props;
  return (
    <div className="message-row message-row--clarify clarify-card">
      <div className="message-content">{request.question}</div>
      <div className="clarify-actions">
        {(request.choices || ["跳过"]).map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onAnswer?.(request.requestId, choice)}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}
