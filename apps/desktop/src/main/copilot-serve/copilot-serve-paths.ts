import { existsSync } from "fs";
import { dirname, join } from "path";
import { app } from "electron";
import { HERMES_HOME } from "../installer";
import { readRuntimeConfig } from "../enterprise/desktop-runtime-config";
import { resolveInstallLocation } from "../enterprise/windows/install-location-resolver";
import { resolveCopilotRuntimePaths } from "../runtime/runtime-paths";

const DEFAULT_PORT = 8765;

export interface CopilotServePaths {
  serveRoot: string;
  serveRuntimeRoot: string;
  sqlitePath: string;
  logPath: string;
  port: number;
  deployScriptPath: string | null;
}

function isValidServeRoot(dir: string): boolean {
  return existsSync(join(dir, "pyproject.toml"));
}

function legacyServeRoots(runtimeRoot: string): string[] {
  return [
    join(runtimeRoot, "serve", "src"),
    join(runtimeRoot, "copilot-serve"),
  ];
}

export function getCopilotServePort(): number {
  const config = readRuntimeConfig();
  if (config?.copilotServePort && config.copilotServePort > 0) {
    return config.copilotServePort;
  }
  const raw = process.env.COPILOT_SERVE_PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

export function resolveCopilotServeDeployScript(): string | null {
  const config = readRuntimeConfig();
  if (config?.copilotServeDeployScript && existsSync(config.copilotServeDeployScript)) {
    return config.copilotServeDeployScript;
  }

  const loc = resolveInstallLocation();
  const candidates = [
    join(loc.runtimeRoot, "deploy-serve-runtime.ps1"),
    join(loc.runtimeRoot, "deploy-copilot-serve.ps1"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export function resolveCopilotServeRoot(): string | null {
  const fromEnv = process.env.COPILOT_SERVE_ROOT?.trim();
  if (fromEnv && isValidServeRoot(fromEnv)) {
    return fromEnv;
  }

  const config = readRuntimeConfig();
  if (config?.serveSourceRoot && isValidServeRoot(config.serveSourceRoot)) {
    return config.serveSourceRoot;
  }
  if (config?.copilotServeDir && isValidServeRoot(config.copilotServeDir)) {
    return config.copilotServeDir;
  }

  try {
    const paths = resolveCopilotRuntimePaths();
    if (isValidServeRoot(paths.serveSourceRoot)) {
      return paths.serveSourceRoot;
    }

    const loc = resolveInstallLocation();
    for (const candidate of legacyServeRoots(loc.runtimeRoot)) {
      if (isValidServeRoot(candidate)) {
        return candidate;
      }
    }

    const exeDir = dirname(app.getPath("exe"));
    for (const candidate of [
      join(exeDir, "runtime", "serve", "src"),
      join(exeDir, "runtime", "copilot-serve"),
      join(exeDir, "resources", "runtime", "serve", "src"),
    ]) {
      if (isValidServeRoot(candidate)) {
        return candidate;
      }
    }
  } catch {
    /* app not ready or non-Windows */
  }

  const devCandidates = [
    join(process.cwd(), "copilot-serve"),
    join(process.cwd(), "..", "copilot-serve"),
    join(__dirname, "..", "..", "..", "..", "copilot-serve"),
    join(__dirname, "..", "..", "..", "copilot-serve"),
  ];

  for (const candidate of devCandidates) {
    if (isValidServeRoot(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** Installed layout exists but repo/venv may not be deployed yet */
export function resolveCopilotServeRuntimeDir(): string | null {
  const paths = resolveCopilotRuntimePaths();
  const root = resolveCopilotServeRoot();

  if (root) {
    if (root === paths.serveSourceRoot) {
      return paths.serveRuntimeRoot;
    }
    const normalized = root.replace(/\\/g, "/");
    if (normalized.endsWith("/copilot-serve")) {
      return root;
    }
    if (existsSync(join(dirname(root), "venv"))) {
      return dirname(root);
    }
    return paths.serveRuntimeRoot;
  }

  const config = readRuntimeConfig();
  if (config?.serveRuntimeRoot) return config.serveRuntimeRoot;

  return paths.serveRuntimeRoot;
}

export function resolveCopilotServeVenvPython(): string | null {
  const fromEnv = process.env.COPILOT_SERVE_PYTHON?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const runtimeDir = resolveCopilotServeRuntimeDir();
  if (!runtimeDir) return null;

  const paths = resolveCopilotRuntimePaths();
  const candidates =
    process.platform === "win32"
      ? [
          join(paths.serveRuntimeRoot, "venv", "Scripts", "python.exe"),
          join(runtimeDir, "venv", "Scripts", "python.exe"),
          join(runtimeDir, ".venv", "Scripts", "python.exe"),
        ]
      : [
          join(paths.serveRuntimeRoot, "venv", "bin", "python"),
          join(runtimeDir, "venv", "bin", "python"),
          join(runtimeDir, ".venv", "bin", "python"),
        ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** Refresh in-process env after deploy (User-level env vars are not visible until restart). */
export function applyCopilotServeEnvFromDisk(serveRoot: string, port?: number): void {
  process.env.COPILOT_SERVE_ROOT = serveRoot;
  const runtimeDir = resolveCopilotServeRuntimeDir();
  if (runtimeDir) {
    process.env.COPILOT_SERVE_RUNTIME_ROOT = runtimeDir;
  }
  const python = resolveCopilotServeVenvPython();
  if (python) {
    process.env.COPILOT_SERVE_PYTHON = python;
  }
  const resolvedPort = port ?? getCopilotServePort();
  process.env.COPILOT_SERVE_PORT = String(resolvedPort);
}

export function getCopilotServePaths(): CopilotServePaths | null {
  const serveRoot = resolveCopilotServeRoot();
  if (!serveRoot) return null;

  const runtimeDir = resolveCopilotServeRuntimeDir() ?? dirname(serveRoot);
  const desktopDir = join(HERMES_HOME, "desktop");
  const logsDir = join(runtimeDir, "logs");

  return {
    serveRoot,
    serveRuntimeRoot: runtimeDir,
    sqlitePath: join(desktopDir, "sqlite.db"),
    logPath: existsSync(logsDir)
      ? join(logsDir, "copilot-serve.log")
      : join(desktopDir, "copilot-serve.log"),
    port: getCopilotServePort(),
    deployScriptPath: resolveCopilotServeDeployScript(),
  };
}
