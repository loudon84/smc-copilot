import { join, dirname } from "path";
import { app } from "electron";
import { resolveCopilotRuntimePaths } from "../runtime/runtime-paths";
import {
  isPortalMonorepoRoot,
  readConfigPortalSourceRoot,
  resolveEffectivePortalMonorepoRoot,
} from "../runtime/portal-root-resolver";
import type { AiOsPortalInfo } from "../../shared/aios/aios-contract";

let _cachedPaths: AiOsPaths | null = null;

export interface AiOsPaths {
  aiosRoot: string;
  backendDir: string;
  frontendDir: string;
  envFilePath: string;
  logsDir: string;
  dataDir: string;
}

function devPortalCandidates(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined): void => {
    if (!raw) return;
    const normalized = raw.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  try {
    const appPath = app.getAppPath();
    add(appPath);
    add(dirname(appPath));
    add(join(appPath, ".."));
    add(join(appPath, "../.."));
  } catch {
    /* app not ready */
  }

  // out/main → copilot-desktop → smc-coworker-full (portal monorepo parent)
  add(join(__dirname, "../.."));
  add(join(__dirname, "../../.."));

  return out;
}

function resolvePortalMonorepoRoot(): string {
  const effective = resolveEffectivePortalMonorepoRoot(devPortalCandidates());
  if (effective) return effective;

  const paths = resolveCopilotRuntimePaths();
  return paths.portalSourceRoot;
}

export function getAiOsPaths(): AiOsPaths {
  if (_cachedPaths) return _cachedPaths;

  const paths = resolveCopilotRuntimePaths();
  const aiosRoot = resolvePortalMonorepoRoot();
  const logsDir = join(paths.portalRuntimeRoot, "logs");
  const dataDir = join(paths.runtimeRoot, "data");

  _cachedPaths = {
    aiosRoot,
    backendDir: join(aiosRoot, "backend"),
    frontendDir: join(aiosRoot, "frontend"),
    envFilePath: join(paths.portalRuntimeRoot, ".env.local"),
    logsDir,
    dataDir,
  };

  return _cachedPaths;
}

export function isAiOsInstalled(): boolean {
  return resolveEffectivePortalMonorepoRoot(devPortalCandidates()) !== null;
}

export function getAiOsPortalInfo(): AiOsPortalInfo {
  const paths = resolveCopilotRuntimePaths();
  const effective = resolveEffectivePortalMonorepoRoot(devPortalCandidates());

  return {
    installed: effective !== null,
    portalRoot: effective,
    portalRuntimeRoot: paths.portalRuntimeRoot,
    envPortalRoot: process.env.COPILOT_PORTAL_ROOT?.trim() || null,
    configPortalRoot: readConfigPortalSourceRoot(),
  };
}

export function buildPortalNotInstalledMessage(): string {
  const paths = resolveCopilotRuntimePaths();
  const info = getAiOsPortalInfo();
  const expected = join(paths.portalRuntimeRoot, "src");
  const envHint = info.envPortalRoot
    ? `COPILOT_PORTAL_ROOT=${info.envPortalRoot} (not a valid monorepo)`
    : "COPILOT_PORTAL_ROOT is not set";
  return (
    `Portal is not installed. Expected monorepo (package.json + backend/ + frontend/) at ` +
    `${expected} or set COPILOT_PORTAL_ROOT. ${envHint}. ` +
    `Run build/scripts/deploy-copilot-serve.ps1 to deploy Portal.`
  );
}

export function clearPathCache(): void {
  _cachedPaths = null;
}

export { isPortalMonorepoRoot };
