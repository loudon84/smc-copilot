import { existsSync } from "fs";
import { join } from "path";
import { app } from "electron";

/**
 * Resolve a compiled preload file path.
 *
 * electron-vite output convention:
 * - main:    out/main/**
 * - preload: out/preload/*.js
 */
export function resolveCompiledPreloadPath(fileName: string): string {
  const candidates = [
    join(__dirname, "../preload", fileName),
    join(__dirname, "../../preload", fileName),
  ];

  if (app.isReady()) {
    candidates.push(join(app.getAppPath(), "out", "preload", fileName));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const fallback = candidates[0];
  console.warn(`[PRELOAD] ${fileName} not found, tried:`, candidates);
  return fallback;
}

export function assertPreloadExists(fileName: string): string {
  const path = resolveCompiledPreloadPath(fileName);
  if (!existsSync(path)) {
    console.error(`[PRELOAD] Missing required preload script: ${path}`);
  }
  return path;
}
