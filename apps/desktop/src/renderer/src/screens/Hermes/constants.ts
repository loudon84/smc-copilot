import type { HermesNavItemDefinition, HermesPageSection } from "./model/page";

export type { HermesNavItemDefinition, HermesPageSection };

/** v5.6 — Local Hermes default profile layout & storage keys. */
export const HERMES_DEFAULT_PROFILE = "default" as const;

export const HERMES_DEFAULT_PROFILE_META = {
  id: "default",
  name: "default",
  displayName: "Hermes Default",
  roleName: "本地 Hermes",
  gatewayPort: 8642,
} as const;

export const STORAGE_KEYS = {
  activeRightTab: "hermesDefault.activeRightTab",
  collapsedRightPanel: "hermesDefault.collapsedRightPanel",
  collapsedLeftPanel: "hermesDefault.collapsedLeftPanel",
  activeNavItem: "hermesDefault.activeNavItem",
  activeSessionId: "hermesDefault.activeSessionId",
  workspaceState: "hermesDefault.workspaceState",
  geneHubActiveTab: "hermesDefault.geneHub.activeTab",
  /** @deprecated v5.6.4 使用 Main session-models.json */
  chatPendingModelId: "hermesDefault.chatPendingModelId",
} as const;

export const GENEHUB_SKILL_CENTER_TABS = [
  "available",
  "installed",
  "pending",
  "mcpRegistration",
  "skillPush",
  "logs",
] as const;

export type GeneHubSkillCenterTabKey = (typeof GENEHUB_SKILL_CENTER_TABS)[number];

export function readGeneHubSkillCenterTab(): GeneHubSkillCenterTabKey | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.geneHubActiveTab);
    if (!raw) return null;
    if ((GENEHUB_SKILL_CENTER_TABS as readonly string[]).includes(raw)) {
      return raw as GeneHubSkillCenterTabKey;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeGeneHubSkillCenterTab(tab: GeneHubSkillCenterTabKey): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.geneHubActiveTab, tab);
  } catch {
    /* ignore */
  }
}

export function clearGeneHubSkillCenterTab(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.geneHubActiveTab);
  } catch {
    /* ignore */
  }
}

/** 新会话草稿（尚无 state.db session id） */
export const HERMES_DRAFT_SESSION_ID = "draft_default" as const;

export type HermesNavItemKey =
  | "tasks"
  | "workbench"
  | "chat"
  | "experts"
  | "expertTeams"
  | "expertRuns"
  | "artifacts"
  | "sessions"
  | "skills"
  | "skillCenter"
  | "mcp"
  | "mcpGateway"
  | "tools"
  | "memory"
  | "providers"
  | "models";

export const HERMES_NAV_ITEMS: readonly HermesNavItemDefinition[] = [
  {
    key: "chat",
    labelI18nKey: "workspaces.nav.chat",
    icon: "MessageSquare",
    section: "primary",
  },
  {
    key: "workbench",
    labelI18nKey: "workspaces.nav.workbench",
    icon: "LayoutDashboard",
    section: "primary",
    visible: false,
  },
  {
    key: "tasks",
    labelI18nKey: "workspaces.nav.tasks",
    icon: "ClipboardList",
    section: "primary",
    visible: false,
  },
  {
    key: "experts",
    labelI18nKey: "workspaces.nav.experts",
    icon: "Users",
    section: "primary",
    requiresGateway: true,
  },
  {
    key: "expertTeams",
    labelI18nKey: "workspaces.nav.expertTeams",
    icon: "UsersRound",
    section: "primary",
    requiresGateway: true,
  },
  {
    key: "expertRuns",
    labelI18nKey: "workspaces.nav.expertRuns",
    icon: "Activity",
    section: "primary",
    requiresGateway: true,
    visible: false,
  },
  {
    key: "artifacts",
    labelI18nKey: "workspaces.nav.artifacts",
    icon: "FileBox",
    section: "primary",
    requiresGateway: true,
    visible: false,
  },
  {
    key: "skillCenter",
    labelI18nKey: "workspaces.nav.skillCenter",
    icon: "Library",
    section: "capability",
  },
  {
    key: "mcp",
    labelI18nKey: "workspaces.nav.mcp",
    icon: "Plug",
    section: "capability",
  },
  {
    key: "mcpGateway",
    labelI18nKey: "workspaces.nav.mcpGateway",
    icon: "Globe",
    section: "capability",
  },
  {
    key: "sessions",
    labelI18nKey: "workspaces.nav.sessions",
    icon: "History",
    section: "advanced",
  },
  {
    key: "skills",
    labelI18nKey: "workspaces.nav.skills",
    icon: "Sparkles",
    section: "advanced",
  },
  {
    key: "tools",
    labelI18nKey: "workspaces.nav.tools",
    icon: "Wrench",
    section: "advanced",
  },
  {
    key: "memory",
    labelI18nKey: "workspaces.nav.memory",
    icon: "Brain",
    section: "advanced",
  },
  {
    key: "providers",
    labelI18nKey: "workspaces.nav.providers",
    icon: "Server",
    section: "advanced",
  },
  {
    key: "models",
    labelI18nKey: "workspaces.nav.models",
    icon: "Box",
    section: "advanced",
  },
];

export const HERMES_CONFIG_KEYS = ["provider", "default", "base_url", "streaming"] as const;

export const LAYOUT = {
  sidebarWidthPx: 220,
  sidebarCollapsedWidthPx: 48,
  rightPanelWidthPx: 340,
  rightPanelCollapsedWidthPx: 48,
  centerMinWidthPx: 520,
  taskListWidthPx: 280,
  taskRightPanelWidthPx: 420,
} as const;
