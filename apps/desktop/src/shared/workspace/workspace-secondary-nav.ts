import type {
  StaticWorkspaceId,
  WorkspaceSecondaryPanel,
} from "./workspace-contract";

export const SECONDARY_NAV_BY_WORKSPACE: Record<
  StaticWorkspaceId,
  WorkspaceSecondaryPanel[]
> = {
  portal: [],
  workspaces: [],
  "local-hermes": [],
  /** team_v1.5：三栏工作区自包含，侧栏不再切换子面板 */
  "task-workbench": [],
  "web-operator": [
    "browser-state",
    "host-context",
    "hermes-task",
    "page-structure",
    "action-log",
  ],
  "crm-workbench": [],
  office: ["office"],
};

export const SECONDARY_PANEL_LABEL_KEYS: Record<WorkspaceSecondaryPanel, string> = {
  chat: "navigation.chat",
  sessions: "navigation.sessions",
  agents: "navigation.agents",
  workspace: "workspaces.tabs.workspace",
  skills: "workspaces.tabs.skills",
  memory: "workspaces.tabs.memory",
  runtime: "workspaces.tabs.runtime",
  "browser-state": "navigation.browserState",
  "host-context": "navigation.hostContext",
  "crm-context": "navigation.hostContext",
  "hermes-task": "navigation.hermesTask",
  "page-structure": "navigation.pageStructure",
  "action-log": "navigation.actionLog",
  office: "navigation.office",
};

export function defaultSecondaryPanel(workspaceId: StaticWorkspaceId): string | undefined {
  if (workspaceId === "web-operator") return undefined;
  const items = SECONDARY_NAV_BY_WORKSPACE[workspaceId];
  return items[0];
}

export function isSecondaryPanelForWorkspace(
  workspaceId: string,
  panel: string,
): boolean {
  if (!(workspaceId in SECONDARY_NAV_BY_WORKSPACE)) return false;
  return SECONDARY_NAV_BY_WORKSPACE[workspaceId as StaticWorkspaceId].includes(
    panel as WorkspaceSecondaryPanel,
  );
}
