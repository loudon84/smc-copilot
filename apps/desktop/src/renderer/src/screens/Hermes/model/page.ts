import type { ComponentType } from "react";
import type { HermesNavItemKey } from "../constants";

/** Work 专家工作台 — 左侧导航分组 */
export type HermesPageSection = "primary" | "capability" | "advanced";

export type HermesNavItemDefinition = {
  key: HermesNavItemKey;
  labelI18nKey: string;
  icon: string;
  section: HermesPageSection;
  visible?: boolean;
  requiresGateway?: boolean;
};

export interface HermesPageDefinition extends HermesNavItemDefinition {
  component: ComponentType;
}

export const HERMES_PAGE_SECTIONS: HermesPageSection[] = [
  "primary",
  "capability",
  "advanced",
];

export const HERMES_PAGE_SECTION_I18N: Record<HermesPageSection, string> = {
  primary: "workspaces.nav.section.primary",
  capability: "workspaces.nav.section.capability",
  advanced: "workspaces.nav.section.advanced",
};

/** capability / advanced 默认折叠 */
export const HERMES_PAGE_SECTION_DEFAULT_COLLAPSED: Record<HermesPageSection, boolean> = {
  primary: false,
  capability: true,
  advanced: true,
};
