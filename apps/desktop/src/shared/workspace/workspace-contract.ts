/** Static workspace ids (V3.2 primary workspaces). */
export type StaticWorkspaceId =
  | "portal"
  | "workspaces"
  | "local-hermes"
  | "task-workbench"
  | "web-operator"
  | "crm-workbench"
  | "office";

export type ExternalBrowserWorkspaceId = `external-browser:${string}`;

export type WorkspaceId = StaticWorkspaceId | ExternalBrowserWorkspaceId;

export type WorkspaceKind = "webview" | "react" | "composite";

export type WorkspaceSource =
  | "system"
  | "local"
  | "hermes"
  | "operator"
  | "crm"
  | "office"
  | "external";

export interface WorkspaceModule {
  id: StaticWorkspaceId;
  titleKey: string;
  kind: WorkspaceKind;
  closeable: boolean;
  draggable: boolean;
  persistable: boolean;
  /** When false, workspace is reachable via navigation but omitted from top tabs. */
  showInTabBar?: boolean;
  shellLayerId?: string;
  source: WorkspaceSource;
}

export type WorkspaceSecondaryPanel =
  | "chat"
  | "sessions"
  | "agents"
  | "workspace"
  | "skills"
  | "memory"
  | "runtime"
  | "browser-state"
  | "host-context"
  | "crm-context"
  | "hermes-task"
  | "page-structure"
  | "action-log"
  | "office";
