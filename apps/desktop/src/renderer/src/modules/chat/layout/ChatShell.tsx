import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Root column shell for Copilot Chat — owns full height, hosts
 * TopBar + ChatBody + ComposerArea as vertical siblings.
 */
export function ChatShell({
  children,
  className,
}: Props): React.JSX.Element {
  return (
    <div className={`copilot-chat-root chat-shell ${className || ""}`.trim()}>
      {children}
    </div>
  );
}

export default ChatShell;
