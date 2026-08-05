/**
 * Shared content rail — Empty / Messages / Composer share the same max width.
 */
export function ChatContentRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`chat-content-rail ${className || ""}`.trim()}>
      {children}
    </div>
  );
}
