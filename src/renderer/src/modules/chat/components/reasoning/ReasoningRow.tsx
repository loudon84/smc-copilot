/** Thin production wrappers — reasoning / tools / clarify / navigator slots. */

export { MessageList } from "../messages/MessageList";

export function ReasoningRow(props: {
  content: string;
}): React.JSX.Element {
  return (
    <div className="message-row message-row--reasoning">
      <div className="message-content">
        <span className="message-kind-label">Reasoning</span>
        {props.content}
      </div>
    </div>
  );
}
