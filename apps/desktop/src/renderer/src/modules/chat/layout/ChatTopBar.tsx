import type { ReactNode } from "react";

type Props = {
  children?: ReactNode;
  className?: string;
  /** Optional overflow actions (e.g. diagnostics export). */
  actions?: ReactNode;
};

/**
 * Compact single-row chat header ≤36px (PRD v1.6.1 §35/§63).
 * Renders Expert/Team/Default identity; no run status / diagnostics / folder.
 */
export function ChatTopBar({
  children,
  className,
  actions,
}: Props): React.JSX.Element | null {
  if (!children && !actions) return null;
  return (
    <div className={`chat-top-bar ${className || ""}`.trim()}>
      <div className="chat-top-bar-main">{children}</div>
      {actions ? <div className="chat-top-bar-actions">{actions}</div> : null}
    </div>
  );
}

export default ChatTopBar;
