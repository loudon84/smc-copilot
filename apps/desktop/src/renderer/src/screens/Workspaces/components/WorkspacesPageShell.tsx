import type { ReactNode } from "react";

/** Wraps lazy center-panel pages so layout scrolls inside Workspaces shell. */
export function WorkspacesPageShell({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="workspaces-page">{children}</div>;
}
