import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { InstallMarker } from "../../shared/enterprise/enterprise-schema";
import { getHermesBasePath } from "./deployment-config";

function getMarkerPath(): string {
  return join(getHermesBasePath(), "install-marker.json");
}

export function writeInstallMarker(marker: InstallMarker): { ok: boolean; message?: string } {
  const markerPath = getMarkerPath();

  mkdirSync(join(getHermesBasePath()), { recursive: true });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      writeFileSync(markerPath, JSON.stringify(marker, null, 2), "utf-8");
      return { ok: true };
    } catch (err) {
      if (attempt === 3) {
        return { ok: false, message: `install-marker 写入失败: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
  }

  return { ok: true };
}

export function readInstallMarker(): InstallMarker | null {
  const markerPath = getMarkerPath();
  if (!existsSync(markerPath)) return null;

  try {
    const raw = readFileSync(markerPath, "utf-8");
    return JSON.parse(raw) as InstallMarker;
  } catch {
    return null;
  }
}

export function existsInstallMarker(): boolean {
  return existsSync(getMarkerPath());
}
