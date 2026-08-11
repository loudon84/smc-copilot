import type { ReactNode } from "react";

export type ChatNavigatorKind = "session-files" | "worktree" | null;

type Props = {
  /** Session Files or Worktree — mutually exclusive navigator. */
  navigator?: ReactNode;
  /** File Preview detail panel. */
  preview?: ReactNode;
  /** When true, preview covers the entire ChatBody (not Composer). */
  previewMaximized?: boolean;
  className?: string;
};

/**
 * Hosts Navigator + Detail panels as ChatBody siblings.
 * Each panel owns its own width; no generic right-panel wrapper.
 */
export function ChatWorkspacePanelHost({
  navigator,
  preview,
  previewMaximized,
  className,
}: Props): React.JSX.Element | null {
  if (!navigator && !preview) return null;

  return (
    <div
      className={`chat-workspace-panels ${previewMaximized ? "is-preview-maximized" : ""} ${className || ""}`.trim()}
    >
      {navigator}
      {preview}
    </div>
  );
}

export default ChatWorkspacePanelHost;
