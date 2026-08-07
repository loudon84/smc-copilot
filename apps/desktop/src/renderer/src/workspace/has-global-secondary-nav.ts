import { SECONDARY_NAV_BY_WORKSPACE } from "../../../shared/workspace/workspace-secondary-nav";
import type { View } from "../types/desktop-shell";
import { isStaticWorkspaceId } from "./workspace-registry";

/** True when the top-level shell should show global DesktopSidebar (web-operator, office). */
export function hasGlobalSecondaryNav(view: View): boolean {
  if (typeof view !== "string" || !isStaticWorkspaceId(view)) {
    return false;
  }
  return SECONDARY_NAV_BY_WORKSPACE[view].length > 0;
}
