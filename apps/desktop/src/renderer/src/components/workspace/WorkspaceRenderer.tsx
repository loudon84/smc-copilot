import Office from "../../screens/Office/Office";
import { WebOperatorScreen } from "../../screens/WebOperator/WebOperatorScreen";
import { WorkspacesScreen } from "../../screens/Workspaces";
import { PortalScreen } from "../../screens/Portal/Index";
import { TaskWorkbenchScreen } from "../../screens/TaskWorkbench/TaskWorkbenchScreen";
import { HermesScreen } from "../../screens/Hermes";
import { CrmWorkbenchScreen } from "../../screens/Crm/CrmWorkbenchScreen";
import { resolveWorkspaceModule } from "../../workspace/workspace-registry";
import type { View } from "../../types/desktop-shell";
import type { SettingsDrawerPanel } from "../../screens/SettingsDrawer/settings-drawer-types";
import {
  DEFAULT_WEB_OPERATOR_LAYOUT,
  type WebOperatorLayoutState,
} from "../../../../shared/shell/main-page-state-contract";
import { CompositeWorkspace } from "./CompositeWorkspace";
import { ReactWorkspace } from "./ReactWorkspace";
import { WebViewWorkspace } from "./WebViewWorkspace";

export interface WorkspaceRendererProps {
  workspaceId: View;
  activeProfile: string;
  officeVisited: boolean;
  onNavigate: (view: View) => void;
  onOpenSettingsDrawer?: (panel?: SettingsDrawerPanel) => void;
  secondaryPanel?: string;
  onSecondaryPanelChange?: (panel: string) => void;
  webOperatorLayout?: WebOperatorLayoutState;
  onWebOperatorLayoutChange?: (next: WebOperatorLayoutState) => void;
}

function WorkspaceShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}

export function WorkspaceRenderer(props: WorkspaceRendererProps): React.JSX.Element {
  const {
    workspaceId,
    activeProfile,
    officeVisited,
    onNavigate,
    onOpenSettingsDrawer,
    secondaryPanel,
    onSecondaryPanelChange,
    webOperatorLayout = DEFAULT_WEB_OPERATOR_LAYOUT,
    onWebOperatorLayoutChange,
  } = props;

  if (typeof workspaceId === "string" && workspaceId.startsWith("external-browser:")) {
    return (
      <WorkspaceShell>
        <WebViewWorkspace layerId={workspaceId} enabled />
      </WorkspaceShell>
    );
  }

  const module = resolveWorkspaceModule(workspaceId);
  if (!module) {
    return <></>;
  }

  switch (module.kind) {
    case "webview":
      return (
        <ReactWorkspace active={workspaceId === "portal"}>
          <WorkspaceShell>
            <PortalScreen
              enabled={workspaceId === "portal"}
              onNavigate={onNavigate}
              onOpenRuntimeSettings={() => onOpenSettingsDrawer?.("runtime")}
            />
          </WorkspaceShell>
        </ReactWorkspace>
      );
    case "composite":
      return (
        <CompositeWorkspace active={workspaceId === "web-operator"}>
          <WebOperatorScreen
            enabled={workspaceId === "web-operator"}
            focusedPanel={secondaryPanel}
            onFocusedPanelChange={onSecondaryPanelChange}
            layout={webOperatorLayout}
            onLayoutChange={onWebOperatorLayoutChange ?? (() => {})}
          />
        </CompositeWorkspace>
      );
    case "react":
      if (module.id === "office") {
        if (!officeVisited) return <></>;
        return (
          <ReactWorkspace active={workspaceId === "office"}>
            <Office visible={workspaceId === "office"} />
          </ReactWorkspace>
        );
      }
      if (module.id === "task-workbench") {
        return (
          <ReactWorkspace active={workspaceId === "task-workbench"}>
            <WorkspaceShell>
              <TaskWorkbenchScreen />
            </WorkspaceShell>
          </ReactWorkspace>
        );
      }
      if (module.id === "local-hermes") {
        return (
          <ReactWorkspace active={workspaceId === "local-hermes"}>
            <WorkspaceShell>
              <HermesScreen
                activePanel={secondaryPanel}
                onPanelChange={onSecondaryPanelChange}
                onOpenRuntimeSettings={() => onOpenSettingsDrawer?.("runtime")}
              />
            </WorkspaceShell>
          </ReactWorkspace>
        );
      }
      if (module.id === "crm-workbench") {
        return (
          <ReactWorkspace active={workspaceId === "crm-workbench"}>
            <WorkspaceShell>
              <CrmWorkbenchScreen
                enabled={workspaceId === "crm-workbench"}
                onNavigate={onNavigate}
              />
            </WorkspaceShell>
          </ReactWorkspace>
        );
      }
      return (
        <ReactWorkspace active={workspaceId === "workspaces"}>
          <WorkspacesScreen
            profile={activeProfile}
            activePanel={secondaryPanel}
            onPanelChange={onSecondaryPanelChange}
            onOpenSettingsDrawer={onOpenSettingsDrawer}
          />
        </ReactWorkspace>
      );
    default:
      return <></>;
  }
}
