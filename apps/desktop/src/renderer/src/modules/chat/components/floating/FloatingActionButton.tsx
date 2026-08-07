import type { ReactNode } from "react";

type Props = {
  title: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number | string | null;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
};

export function FloatingActionButton({
  title,
  active,
  disabled,
  badge,
  onClick,
  children,
  className,
  "data-testid": testId,
}: Props): React.JSX.Element {
  return (
    <button
      type="button"
      className={`chat-fab ${active ? "is-active" : ""} ${className || ""}`.trim()}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
      {badge != null && badge !== 0 && badge !== "0" ? (
        <span className="chat-fab-badge">{badge}</span>
      ) : null}
    </button>
  );
}
