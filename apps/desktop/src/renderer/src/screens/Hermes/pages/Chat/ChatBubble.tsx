import AgentMarkdown from "../../../../components/AgentMarkdown";
import type { HermesMessage } from "../../types";
import { LocalDocumentCard } from "./components/LocalDocumentCard";
import {
  extractLocalDocumentPaths,
  stripLocalDocumentPaths,
} from "./utils/extractLocalDocumentPaths";

function bubbleModifier(role: HermesMessage["role"]): string {
  if (role === "user") return "hermes-chat-bubble--user";
  return "hermes-chat-bubble--assistant";
}

export function ChatBubble({ message }: { message: HermesMessage }): React.JSX.Element {
  const isAssistant =
    message.role === "assistant" || message.role === "system" || message.role === "tool";
  const localDocuments =
    isAssistant && message.content ? extractLocalDocumentPaths(message.content) : [];
  const markdownContent =
    isAssistant && localDocuments.length > 0
      ? stripLocalDocumentPaths(message.content, localDocuments)
      : message.content;

  return (
    <div className={`hermes-chat-bubble ${bubbleModifier(message.role)}`}>
      <div className="hermes-chat-bubble__content">
        {isAssistant ? (
          <>
            {markdownContent ? <AgentMarkdown>{markdownContent}</AgentMarkdown> : null}
            {localDocuments.map((doc) => (
              <LocalDocumentCard key={doc.path} document={doc} />
            ))}
          </>
        ) : (
          <span className="hermes-chat-bubble-pre">{message.content}</span>
        )}
      </div>
    </div>
  );
}
