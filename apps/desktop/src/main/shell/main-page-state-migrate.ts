import {
  normalizeWebOperatorLayout,
  type MainPagePersistedStateV1,
  type MainPagePersistedStateV2,
} from "../../shared/shell/main-page-state-contract";

const DEFAULT_V2: MainPagePersistedStateV2 = {
  version: 2,
  sidebarMode: "expanded",
  workspaceOrder: [],
  externalTabs: [],
};

function migrateWorkspaceId(id: string | undefined): string | undefined {
  if (id === "aios-home") return "portal";
  return id;
}

function migrateWorkspaceIdList(ids: string[]): string[] {
  return ids.map((id) => migrateWorkspaceId(id) ?? id);
}

function migrateWorkspaceSecondaryState(
  state: Record<string, string> | undefined,
): Record<string, string> {
  if (!state || typeof state !== "object") return {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(state)) {
    next[migrateWorkspaceId(key) ?? key] = value;
  }
  return next;
}

export function migrateMainPageState(input: unknown): MainPagePersistedStateV2 {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_V2 };
  }

  const raw = input as Record<string, unknown>;

  if (raw.version === 2) {
    return normalizeV2(raw as Partial<MainPagePersistedStateV2>);
  }

  if (raw.version === 1) {
    return migrateV1ToV2(raw as Partial<MainPagePersistedStateV1>);
  }

  return { ...DEFAULT_V2 };
}

function migrateV1ToV2(v1: Partial<MainPagePersistedStateV1>): MainPagePersistedStateV2 {
  return {
    version: 2,
    sidebarMode: v1.sidebarMode ?? "expanded",
    workspaceOrder: migrateWorkspaceIdList(
      Array.isArray(v1.tabOrder) ? v1.tabOrder : [],
    ),
    externalTabs: Array.isArray(v1.externalTabs) ? v1.externalTabs : [],
    lastActiveWorkspace: migrateWorkspaceId(v1.lastActiveView),
    workspaceSecondaryState: {},
  };
}

function normalizeV2(raw: Partial<MainPagePersistedStateV2>): MainPagePersistedStateV2 {
  return {
    version: 2,
    sidebarMode: raw.sidebarMode ?? "expanded",
    workspaceOrder: migrateWorkspaceIdList(
      Array.isArray(raw.workspaceOrder) ? raw.workspaceOrder : [],
    ),
    externalTabs: Array.isArray(raw.externalTabs) ? raw.externalTabs : [],
    lastActiveWorkspace: migrateWorkspaceId(raw.lastActiveWorkspace),
    lastSettingsDrawerPanel: raw.lastSettingsDrawerPanel,
    workspaceSecondaryState: migrateWorkspaceSecondaryState(raw.workspaceSecondaryState),
    webOperatorLayout: raw.webOperatorLayout
      ? normalizeWebOperatorLayout(raw.webOperatorLayout)
      : undefined,
  };
}
