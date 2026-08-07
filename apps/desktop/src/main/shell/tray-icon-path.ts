import { app } from "electron";
import { existsSync } from "fs";
import { join } from "path";

function unique(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

export function resolveTrayIconPath(): string {
  const appPath = app.getAppPath();
  const resourcesPath = process.resourcesPath;

  const windowsCandidates = unique([
    join(resourcesPath, "icon.ico"),
    join(resourcesPath, "resources", "icon.ico"),
    join(appPath, "build", "icon.ico"),
    join(appPath, "resources", "icon.ico"),
    join(appPath, "resources", "icon.png"),
  ]);

  const darwinCandidates = unique([
    join(resourcesPath, "iconTemplate.png"),
    join(resourcesPath, "resources", "iconTemplate.png"),
    join(appPath, "resources", "iconTemplate.png"),
    join(appPath, "resources", "icon.png"),
  ]);

  const linuxCandidates = unique([
    join(resourcesPath, "icon.png"),
    join(resourcesPath, "resources", "icon.png"),
    join(appPath, "resources", "icon.png"),
  ]);

  const candidates =
    process.platform === "win32"
      ? windowsCandidates
      : process.platform === "darwin"
        ? darwinCandidates
        : linuxCandidates;

  const found = candidates.find((candidate) => existsSync(candidate));

  if (!found) {
    throw new Error(`[TRAY] Tray icon not found. candidates=${candidates.join("; ")}`);
  }

  console.log(`[TRAY] Tray icon resolved: ${found}`);
  return found;
}
