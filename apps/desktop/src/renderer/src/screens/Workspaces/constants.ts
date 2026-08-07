/** team_v1.5 专家 Profile 静态元数据（端口仅用于 Runtime 展示，不拼入角色名） */
export const EXPERT_PROFILE_ENTRIES = [
  {
    id: "default",
    routeKey: "default",
    roleName: "智能助手",
    displayName: "智能助手",
    gatewayPort: 8642,
  },
  {
    id: "writer-9601",
    routeKey: "writer",
    roleName: "写作生文专家",
    displayName: "写作生文专家",
    gatewayPort: 9601,
  },
  /*
  {
    id: "research-9602",
    routeKey: "research",
    roleName: "数据研究专家",
    displayName: "数据研究专家",
    gatewayPort: 9602,
  },
  {
    id: "engineer-9612",
    routeKey: "engineer",
    roleName: "智能体专家",
    displayName: "智能体专家",
    gatewayPort: 9612,
  },
  {
    id: "hurman-9621",
    routeKey: "hurman",
    roleName: "招聘专家",
    displayName: "招聘专家",
    gatewayPort: 9621,
  },
  {
    id: "finance-9631",
    routeKey: "finance",
    roleName: "财经专家",
    displayName: "财经专家",
    gatewayPort: 9631,
  },
  {
    id: "sales-9641",
    routeKey: "sales",
    roleName: "销售专家",
    displayName: "销售专家",
    gatewayPort: 9641,
  },
  */
] as const;

export type ExpertProfileId = (typeof EXPERT_PROFILE_ENTRIES)[number]["id"];

export const EXPERT_PROFILE_IDS: ExpertProfileId[] = EXPERT_PROFILE_ENTRIES.map((e) => e.id);

export const EXPERT_PROFILE_BY_ID = Object.fromEntries(
  EXPERT_PROFILE_ENTRIES.map((e) => [e.id, e]),
) as Record<ExpertProfileId, (typeof EXPERT_PROFILE_ENTRIES)[number]>;

export const EXPERT_PROFILE_BY_ROUTE_KEY = Object.fromEntries(
  EXPERT_PROFILE_ENTRIES.map((e) => [e.routeKey, e]),
) as Record<(typeof EXPERT_PROFILE_ENTRIES)[number]["routeKey"], (typeof EXPERT_PROFILE_ENTRIES)[number]>;

/** localStorage / 旧路由可能仍使用 default-8642 */
export const LEGACY_EXPERT_PROFILE_ID_ALIASES: Record<string, string> = {
  "default-8642": "default",
};

export const EXPERT_PROFILE_LOOKUP_KEYS = new Set<string>(
  EXPERT_PROFILE_ENTRIES.flatMap((e) => [e.id, e.routeKey]),
);

export const STORAGE_KEYS = {
  activeProfileId: "workspaces.activeProfileId",
  activeRightTab: "workspaces.activeRightTab",
  collapsedRightPanel: "workspaces.collapsedRightPanel",
  collapsedLeftPanel: "workspaces.collapsedLeftPanel",
  activeNavItem: "workspaces.activeNavItem",
} as const;

export type NavItemKey =
  | "chat"
  | "sessions"
  | "skills"
  | "tools"
  | "memory"
  | "providers"
  | "models";

export const SIDEBAR_NAV_ITEMS: ReadonlyArray<{
  key: NavItemKey;
  labelI18nKey: string;
  icon: string;
}> = [
  { key: "chat", labelI18nKey: "workspaces.nav.chat", icon: "MessageSquare" },
  { key: "sessions", labelI18nKey: "workspaces.nav.sessions", icon: "History" },
  { key: "skills", labelI18nKey: "workspaces.nav.skills", icon: "Sparkles" },
  { key: "tools", labelI18nKey: "workspaces.nav.tools", icon: "Wrench" },
  { key: "memory", labelI18nKey: "workspaces.nav.memory", icon: "Brain" },
  { key: "providers", labelI18nKey: "workspaces.nav.providers", icon: "Server" },
  { key: "models", labelI18nKey: "workspaces.nav.models", icon: "Box" },
] as const;

export const LAYOUT = {
  sidebarWidthPx: 220,
  sidebarCollapsedWidthPx: 48,
  rightPanelWidthPx: 340,
  rightPanelCollapsedWidthPx: 48,
  centerMinWidthPx: 520,
} as const;
