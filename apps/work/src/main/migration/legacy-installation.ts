export type RegistryHive = "HKLM" | "HKCU";
export type RegistryView = 32 | 64;

export interface RegistryReader {
  read(
    hive: RegistryHive,
    view: RegistryView,
    key: string,
    valueName: string,
  ): string | null;
}

export const CURRENT_APP_ID = "com.smc.copilot";
export const LEGACY_APP_ID = "com.nousresearch.hermes";
export const CURRENT_EXECUTABLE = "smc-copilot.exe";
export const LEGACY_EXECUTABLE = "copilot-desktop.exe";

export function installRegistryKey(appId: string): string {
  return `Software\\${appId}`;
}

export function uninstallRegistryKey(appId: string): string {
  return `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}`;
}

export interface DetectedInstallation {
  source: "current" | "legacy";
  hive: RegistryHive;
  view: RegistryView;
  installLocation: string | null;
  uninstallString: string | null;
  displayName: string | null;
}

const SEARCH_ORDER: Array<{ hive: RegistryHive; view: RegistryView }> = [
  { hive: "HKLM", view: 64 },
  { hive: "HKCU", view: 64 },
  { hive: "HKLM", view: 32 },
  { hive: "HKCU", view: 32 },
];

function readInstall(reader: RegistryReader, appId: string): DetectedInstallation | null {
  for (const { hive, view } of SEARCH_ORDER) {
    const installLocation =
      reader.read(hive, view, installRegistryKey(appId), "InstallLocation") ??
      reader.read(hive, view, uninstallRegistryKey(appId), "InstallLocation");
    const uninstallString = reader.read(
      hive,
      view,
      uninstallRegistryKey(appId),
      "UninstallString",
    );
    const displayName = reader.read(hive, view, uninstallRegistryKey(appId), "DisplayName");
    if (installLocation || uninstallString) {
      return {
        source: appId === CURRENT_APP_ID ? "current" : "legacy",
        hive,
        view,
        installLocation,
        uninstallString,
        displayName,
      };
    }
  }
  return null;
}

export function detectCurrentInstallation(reader: RegistryReader): DetectedInstallation | null {
  return readInstall(reader, CURRENT_APP_ID);
}

export function detectLegacyInstallation(reader: RegistryReader): DetectedInstallation | null {
  return readInstall(reader, LEGACY_APP_ID);
}

export function resolveInstallLocation(
  reader: RegistryReader,
  pathExists: (path: string) => boolean,
): string | null {
  const current = detectCurrentInstallation(reader);
  if (current?.installLocation && pathExists(current.installLocation)) {
    return current.installLocation;
  }
  const legacy = detectLegacyInstallation(reader);
  if (legacy?.installLocation && pathExists(legacy.installLocation)) {
    return legacy.installLocation;
  }
  return null;
}
