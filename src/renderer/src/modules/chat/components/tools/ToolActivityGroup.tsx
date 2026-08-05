import type { ChatToolEvent } from "@shared/chat-runtime/chat-runtime-events";

export function ToolActivityGroup(props: {
  events: ChatToolEvent[];
}): React.JSX.Element | null {
  if (props.events.length === 0) return null;
  return (
    <div className="tool-activity-group">
      {props.events.map((e) => (
        <div key={e.callId} className="message-row message-row--tool">
          <div className="message-content">
            <span className="message-kind-label">{e.label || e.name}</span>
            {e.status}
          </div>
        </div>
      ))}
    </div>
  );
}
