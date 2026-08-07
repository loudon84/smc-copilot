import { WebContentsHost } from "../shell/WebContentsHost";

export interface WebViewWorkspaceProps {
  layerId: string;
  className?: string;
  enabled?: boolean;
}

export function WebViewWorkspace({
  layerId,
  className = "h-full w-full min-h-0",
  enabled = true,
}: WebViewWorkspaceProps): React.JSX.Element {
  return <WebContentsHost layerId={layerId} className={className} enabled={enabled} />;
}
