import type { LucideIcon } from "lucide-react";

export type View =
  | "portal"
  | "workspaces"
  | "local-hermes"
  | "task-workbench"
  | "web-operator"
  | "crm-workbench"
  | "office"
  | `external-browser:${string}`;

export interface NavItem {
  view: Exclude<View, `external-browser:${string}`>;
  icon: LucideIcon;
  labelKey: string;
}

export type UpdateState = "available" | "downloading" | "ready" | null;

export const VIEW_TITLE_KEYS: Partial<Record<View, string>> = {
  portal: "navigation.portal",
  workspaces: "navigation.workspaces",
  "local-hermes": "navigation.localHermes",
  "task-workbench": "navigation.taskWorkbench",
  "web-operator": "navigation.webOperator",
  "crm-workbench": "navigation.crm.workbench",
  office: "navigation.office",
};

export function resolveViewTitleKey(view: View): string {
  if (typeof view === "string" && view.startsWith("external-browser:")) {
    return "navigation.externalBrowser";
  }
  return VIEW_TITLE_KEYS[view] ?? "navigation.portal";
}
