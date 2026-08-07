import { STATIC_WORKSPACE_MODULES, isStaticWorkspaceId } from "./workspace-registry";
import type { MainWorkspaceTab } from "../screens/MainPage/main-page-types";
import type { ExternalBrowserTab } from "../screens/MainPage/main-page-types";

export function buildWorkspaceTabs(
  externalTabs: ExternalBrowserTab[] = [],
): MainWorkspaceTab[] {
  const staticTabs: MainWorkspaceTab[] = STATIC_WORKSPACE_MODULES.filter(
    (module) => module.showInTabBar !== false,
  ).map((module) => {
    const source: MainWorkspaceTab["source"] =
      module.source === "operator"
        ? "operator"
        : module.source === "crm"
          ? "operator"
          : module.source === "external"
            ? "external"
            : "system";
    return {
      id: module.id,
      titleKey: module.titleKey,
      closeable: module.closeable,
      source,
    };
  });

  const external: MainWorkspaceTab[] = externalTabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    closeable: true,
    source: "external",
  }));

  return [...staticTabs, ...external];
}

export function isWorkspaceTabView(view: string): boolean {
  if (isStaticWorkspaceId(view)) return true;
  return view.startsWith("external-browser:");
}
