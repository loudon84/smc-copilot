import type { DesktopInstallLocation } from "../enterprise/windows/install-location-resolver";
import { migrateLegacyHermesRuntime } from "./legacy-hermes-migration";

export function migrateRuntimeLayout(location: DesktopInstallLocation): string[] {
  return migrateLegacyHermesRuntime(location);
}
