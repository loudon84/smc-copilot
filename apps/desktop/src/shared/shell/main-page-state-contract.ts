export type SidebarMode = "expanded" | "rail" | "hidden";

export interface ExternalBrowserTabState {
  id: `external-browser:${string}`;
  title: string;
  url: string;
  createdAt: number;
  updatedAt: number;
}

/** @deprecated V1 — migrated to V2 on read */
export interface MainPagePersistedStateV1 {
  version: 1;
  sidebarMode: SidebarMode;
  tabOrder: string[];
  externalTabs: ExternalBrowserTabState[];
  lastActiveView?: string;
}

/** Web Operator main/side split (v5.5). sideRatio 0.3 ≈ 7:3. */
export interface WebOperatorLayoutState {
  sideRatio: number;
  sideCollapsed: boolean;
}

export const DEFAULT_WEB_OPERATOR_LAYOUT: WebOperatorLayoutState = {
  sideRatio: 0.3,
  sideCollapsed: false,
};

export function normalizeWebOperatorLayout(
  raw?: Partial<WebOperatorLayoutState> | null,
): WebOperatorLayoutState {
  const sideRatio =
    typeof raw?.sideRatio === "number" && Number.isFinite(raw.sideRatio)
      ? Math.min(0.5, Math.max(0.15, raw.sideRatio))
      : DEFAULT_WEB_OPERATOR_LAYOUT.sideRatio;
  return {
    sideRatio,
    sideCollapsed: raw?.sideCollapsed ?? DEFAULT_WEB_OPERATOR_LAYOUT.sideCollapsed,
  };
}

export interface MainPagePersistedStateV2 {
  version: 2;
  sidebarMode: SidebarMode;
  workspaceOrder: string[];
  externalTabs: ExternalBrowserTabState[];
  lastActiveWorkspace?: string;
  lastSettingsDrawerPanel?: string;
  workspaceSecondaryState?: Record<string, string>;
  webOperatorLayout?: WebOperatorLayoutState;
}

export type MainPagePersistedState = MainPagePersistedStateV2;

export const MainPageStateChannels = {
  READ: "main-page:read",
  WRITE: "main-page:write",
} as const;
