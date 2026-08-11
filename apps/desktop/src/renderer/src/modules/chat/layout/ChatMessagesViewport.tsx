import { forwardRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Independent scroll container for the conversation.
 * Ref is forwarded so useChatScroll can attach scroll listeners.
 */
export const ChatMessagesViewport = forwardRef<HTMLDivElement, Props>(
  function ChatMessagesViewport({ children, className }, ref) {
    return (
      <div
        ref={ref}
        className={`chat-messages-viewport ${className || ""}`.trim()}
      >
        <div className="chat-messages-inner">{children}</div>
      </div>
    );
  },
);

export default ChatMessagesViewport;
