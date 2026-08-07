import { ReactWorkspace } from "./ReactWorkspace";

export interface CompositeWorkspaceProps {
  active: boolean;
  children: React.ReactNode;
}

/** Composite workspaces (e.g. web-operator) keep React chrome + native WebContents. */
export function CompositeWorkspace({
  active,
  children,
}: CompositeWorkspaceProps): React.JSX.Element {
  return <ReactWorkspace active={active}>{children}</ReactWorkspace>;
}
