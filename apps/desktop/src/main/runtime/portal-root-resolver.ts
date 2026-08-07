import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveInstallLocation } from "../enterprise/windows/install-location-resolver";

/** Portal monorepo root must contain package.json + backend/ + frontend/. */
export function isPortalMonorepoRoot(dir: string): boolean {
  if (!dir) return false;
  return (
    existsSync(join(dir, "package.json")) &&
    existsSync(join(dir, "backend")) &&
    existsSync(join(dir, "frontend"))
  );
}

/** Read portalSourceRoot from desktop-runtime.json without pulling full runtime path resolution. */
export function readConfigPortalSourceRoot(): string | null {
  const loc = resolveInstallLocation();
  const configPath = join(loc.runtimeRoot, "desktop-runtime.json");
  if (!existsSync(configPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as {
      portalSourceRoot?: string;
    };
    const value = raw.portalSourceRoot?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function filesystemPortalCandidates(runtimeRoot: string): string[] {
  const portalRuntimeRoot = join(runtimeRoot, "portal");
  return [
    join(portalRuntimeRoot, "src"),
    portalRuntimeRoot,
    join(runtimeRoot, "ai-os-full"),
  ];
}

/**
 * Resolve the effective Portal monorepo root.
 * Priority: COPILOT_PORTAL_ROOT → desktop-runtime.json → extraCandidates → runtime filesystem.
 */
export function resolveEffectivePortalMonorepoRoot(
  extraCandidates: string[] = [],
): string | null {
  const seen = new Set<string>();
  const tryCandidate = (raw: string | undefined | null): string | null => {
    if (!raw) return null;
    const normalized = raw.trim();
    if (!normalized || seen.has(normalized)) return null;
    seen.add(normalized);
    return isPortalMonorepoRoot(normalized) ? normalized : null;
  };

  const fromEnv = tryCandidate(process.env.COPILOT_PORTAL_ROOT);
  if (fromEnv) return fromEnv;

  const fromConfig = tryCandidate(readConfigPortalSourceRoot());
  if (fromConfig) return fromConfig;

  for (const candidate of extraCandidates) {
    const hit = tryCandidate(candidate);
    if (hit) return hit;
  }

  const { runtimeRoot } = resolveInstallLocation();
  for (const candidate of filesystemPortalCandidates(runtimeRoot)) {
    const hit = tryCandidate(candidate);
    if (hit) return hit;
  }

  return null;
}
