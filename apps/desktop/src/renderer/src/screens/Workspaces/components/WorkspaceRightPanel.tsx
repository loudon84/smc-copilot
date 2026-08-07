import { LAYOUT } from "../constants";
import { useWorkspaces } from "../context/WorkspacesContext";
import type { RightInspectorTab } from "../types";
import { MemoryPanel } from "../panels/MemoryPanel";
import { RuntimePanel } from "../panels/RuntimePanel";
import { SkillsPanel } from "../panels/SkillsPanel";
import { WorkspacePanel } from "../panels/WorkspacePanel";
import { RightInspectorTabs } from "./RightInspectorTabs";

function RightPanelBody({ tab }: { tab: RightInspectorTab }): React.JSX.Element {
  switch (tab) {
    case "workspace":
      return <WorkspacePanel />;
    case "skills":
      return <SkillsPanel />;
    case "memory":
      return <MemoryPanel />;   
    case "runtime":
      return <RuntimePanel />;
    default:
      return <WorkspacePanel />;
  }
}

export function WorkspaceRightPanel(): React.JSX.Element {
  const { activeRightTab } = useWorkspaces();

  return (
    <aside
      className="workspaces-right-panel"
      style={
        {
          "--ws-right-width": `${LAYOUT.rightPanelWidthPx}px`,
        } as React.CSSProperties
      }
    >
      <RightInspectorTabs />
      <div className="workspaces-right-panel-body">
        <RightPanelBody tab={activeRightTab} />
      </div>
    </aside>
  );
}
