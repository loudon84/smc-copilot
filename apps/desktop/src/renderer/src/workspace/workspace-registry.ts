import type { WorkspaceModule } from "../../../shared/workspace/workspace-contract";

export const STATIC_WORKSPACE_MODULES: WorkspaceModule[] = [
   
  {
    id: "web-operator",
    titleKey: "navigation.webOperator",
    kind: "composite",
    closeable: false,
    draggable: false,
    persistable: true,
    shellLayerId: "web-operator",
    source: "operator",
  },
  {
    id: "crm-workbench",
    titleKey: "navigation.crm.workbench",
    kind: "react",
    closeable: false,
    draggable: false,
    persistable: true,
    showInTabBar: false,
    source: "crm",
  },
  {
    id: "local-hermes",
    titleKey: "navigation.localHermes",
    kind: "react",
    closeable: false,
    draggable: false,
    persistable: true,
    source: "hermes",
  },

  /*
  {
    id: "workspaces",
    titleKey: "navigation.workspaces",
    kind: "react",
    closeable: false,
    draggable: false,
    persistable: true,
    source: "local",
  },
  {
    id: "portal",
    titleKey: "navigation.portal",
    kind: "webview",
    closeable: false,
    draggable: false,
    persistable: true,
    shellLayerId: "portal",
    source: "system",
  },
  {
    id: "task-workbench",
    titleKey: "navigation.taskWorkbench",
    kind: "react",
    closeable: false,
    draggable: false,
    persistable: true,
    source: "local",
  },
  
  {
    id: "office",
    titleKey: "navigation.office",
    kind: "react",
    closeable: false,
    draggable: false,
    persistable: true,
    source: "office",
  },
  */
];

const staticById = new Map(
  STATIC_WORKSPACE_MODULES.map((module) => [module.id, module]),
);

export function resolveWorkspaceModule(
  workspaceId: string,
): WorkspaceModule | null {
  if (workspaceId.startsWith("external-browser:")) {
    return null;
  }
  return staticById.get(workspaceId as WorkspaceModule["id"]) ?? null;
}

export function isStaticWorkspaceId(id: string): id is WorkspaceModule["id"] {
  return staticById.has(id as WorkspaceModule["id"]);
}
