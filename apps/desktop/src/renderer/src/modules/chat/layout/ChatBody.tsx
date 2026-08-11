import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Horizontal workspace row: MessagesViewport + optional Navigator + Preview.
 * Composer lives outside this element so panels never shrink the input area.
 */
export function ChatBody({ children, className }: Props): React.JSX.Element {
  return (
    <div className={`chat-body ${className || ""}`.trim()}>{children}</div>
  );
}

export default ChatBody;
