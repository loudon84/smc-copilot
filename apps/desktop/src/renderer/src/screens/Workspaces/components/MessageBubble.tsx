import AgentMarkdown from "../../../components/AgentMarkdown";
import type { AIOSMessage } from "../types";

function bubbleModifier(role: AIOSMessage["role"]): string {
  if (role === "user") return "is-user";
  return "is-assistant";
}

export function MessageBubble({ message }: { message: AIOSMessage }): React.JSX.Element {
  const isAssistant = message.role === "assistant" || message.role === "system";

  return (
    <div className={`workspaces-chat-bubble ${bubbleModifier(message.role)}`}>
      {isAssistant ? (
        <AgentMarkdown>{message.content}</AgentMarkdown>
      ) : (
        <span className="workspaces-chat-bubble-pre">{message.content}</span>
      )}
    </div>
  );
}
