import { KeepAliveView } from "../layout/KeepAliveView";

export interface ReactWorkspaceProps {
  active: boolean;
  children: React.ReactNode;
}

export function ReactWorkspace({
  active,
  children,
}: ReactWorkspaceProps): React.JSX.Element {
  return <KeepAliveView active={active}>{children}</KeepAliveView>;
}
