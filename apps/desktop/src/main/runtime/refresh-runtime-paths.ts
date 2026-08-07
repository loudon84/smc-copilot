import { clearPathCache } from "../aios/aios-paths";
import { invalidateInstallerPathCache } from "../installer-path-cache";
import { clearCopilotRuntimePathCache } from "./runtime-paths";

/** Clear all runtime path caches after install, deploy, or migration. */
export function refreshAllRuntimePathCaches(): void {
  clearCopilotRuntimePathCache();
  clearPathCache();
  invalidateInstallerPathCache();
}
