import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import { resolveInstallLocation } from "../enterprise/windows/install-location-resolver";
import { resolveEffectivePortalMonorepoRoot } from "./portal-root-resolver";

const isWindows = process.platform === "win32";

export interface CopilotRuntimePaths {
  installRoot: string;
  runtimeRoot: string;
  downloadsRoot: string;
  binDir: string;

  hermesRuntimeRoot: string;
  hermesSourceRoot: string;
  hermesVenv: string;
  hermesPython: string;
  hermesExe: string;

  serveRuntimeRoot: string;
  serveSourceRoot: string;
  serveVenv: string;
  servePython: string;

  portalRuntimeRoot: string;
  portalSourceRoot: string;
  portalNodeModules: string;
}

let _cachedPaths: CopilotRuntimePaths | null = null;

function pythonBin(): string {
  return isWindows ? join("Scripts", "python.exe") : join("bin", "python");
}

function hermesExeBin(): string {
  return isWindows ? join("Scripts", "hermes.exe") : join("bin", "hermes");
}

function hasPythonProject(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some(
      (e) => e === "pyproject.toml" || e === "setup.py" || e === "hermes",
    );
  } catch {
    return false;
  }
}

function resolveHermesVenvDir(agentRoot: string): string | null {
  for (const venvName of ["venv", ".venv"]) {
    const venv = join(agentRoot, venvName);
    if (
      existsSync(join(venv, pythonBin())) &&
      existsSync(join(venv, hermesExeBin()))
    ) {
      return venv;
    }
  }
  return null;
}

/** Legacy Hermes Desktop installs outside the current `$INSTDIR/runtime`. */
function externalLegacyHermesAgentRoots(): string[] {
  const localAppData =
    process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return [
    join(localAppData, "HermesDesktop", "hermes-agent"),
    join(localAppData, "Programs", "HermesDesktop", "hermes-agent"),
    join(localAppData, "Programs", "Hermes Agent", "hermes-agent"),
    join(localAppData, "AIOS-Hermes", "hermes-agent"),
    join(homedir(), ".hermes", "hermes-agent"),
  ];
}

function hermesLayoutHasCli(layout: {
  hermesVenv: string;
}): boolean {
  return (
    existsSync(join(layout.hermesVenv, pythonBin())) &&
    existsSync(join(layout.hermesVenv, hermesExeBin()))
  );
}

function resolveHermesLayout(runtimeRoot: string): {
  hermesRuntimeRoot: string;
  hermesSourceRoot: string;
  hermesVenv: string;
} {
  const hermesRuntimeRoot = join(runtimeRoot, "hermes");
  const standardSource = join(hermesRuntimeRoot, "src");
  const standardVenv = join(hermesRuntimeRoot, "venv");
  const legacyAgent = join(runtimeRoot, "hermes-agent");

  let layout: {
    hermesRuntimeRoot: string;
    hermesSourceRoot: string;
    hermesVenv: string;
  };

  if (hasPythonProject(standardSource)) {
    layout = {
      hermesRuntimeRoot,
      hermesSourceRoot: standardSource,
      hermesVenv: existsSync(standardVenv)
        ? standardVenv
        : existsSync(join(legacyAgent, "venv"))
          ? join(legacyAgent, "venv")
          : existsSync(join(legacyAgent, ".venv"))
            ? join(legacyAgent, ".venv")
            : standardVenv,
    };
  } else if (hasPythonProject(legacyAgent)) {
    const legacyVenv = existsSync(join(legacyAgent, "venv"))
      ? join(legacyAgent, "venv")
      : existsSync(join(legacyAgent, ".venv"))
        ? join(legacyAgent, ".venv")
        : standardVenv;
    layout = {
      hermesRuntimeRoot,
      hermesSourceRoot: legacyAgent,
      hermesVenv: legacyVenv,
    };
  } else if (hasPythonProject(hermesRuntimeRoot)) {
    layout = {
      hermesRuntimeRoot,
      hermesSourceRoot: hermesRuntimeRoot,
      hermesVenv: existsSync(standardVenv) ? standardVenv : join(hermesRuntimeRoot, "venv"),
    };
  } else {
    layout = {
      hermesRuntimeRoot,
      hermesSourceRoot: standardSource,
      hermesVenv: standardVenv,
    };
  }

  if (hermesLayoutHasCli(layout)) {
    return layout;
  }

  for (const agentRoot of externalLegacyHermesAgentRoots()) {
    if (!hasPythonProject(agentRoot)) continue;
    const venv = resolveHermesVenvDir(agentRoot);
    if (!venv) continue;
    return {
      hermesRuntimeRoot,
      hermesSourceRoot: agentRoot,
      hermesVenv: venv,
    };
  }

  return layout;
}

function resolveServeLayout(runtimeRoot: string): {
  serveRuntimeRoot: string;
  serveSourceRoot: string;
  serveVenv: string;
} {
  const serveRuntimeRoot = join(runtimeRoot, "serve");
  const standardSource = join(serveRuntimeRoot, "src");
  const standardVenv = join(serveRuntimeRoot, "venv");
  const legacyServe = join(runtimeRoot, "copilot-serve");

  if (hasPythonProject(standardSource)) {
    return {
      serveRuntimeRoot,
      serveSourceRoot: standardSource,
      serveVenv: existsSync(standardVenv)
        ? standardVenv
        : existsSync(join(legacyServe, "venv"))
          ? join(legacyServe, "venv")
          : existsSync(join(legacyServe, ".venv"))
            ? join(legacyServe, ".venv")
            : standardVenv,
    };
  }

  if (hasPythonProject(legacyServe)) {
    const legacyVenv = existsSync(join(legacyServe, "venv"))
      ? join(legacyServe, "venv")
      : existsSync(join(legacyServe, ".venv"))
        ? join(legacyServe, ".venv")
        : standardVenv;
    return {
      serveRuntimeRoot,
      serveSourceRoot: legacyServe,
      serveVenv: legacyVenv,
    };
  }

  return {
    serveRuntimeRoot,
    serveSourceRoot: standardSource,
    serveVenv: standardVenv,
  };
}

function resolvePortalSourceRoot(
  portalRuntimeRoot: string,
  runtimeRoot: string,
): string {
  const fromEffective = resolveEffectivePortalMonorepoRoot();
  if (fromEffective) return fromEffective;

  const standardSource = join(portalRuntimeRoot, "src");
  if (existsSync(join(standardSource, "package.json"))) {
    return standardSource;
  }
  if (existsSync(join(portalRuntimeRoot, "package.json"))) {
    return portalRuntimeRoot;
  }
  const legacyRoot = join(runtimeRoot, "ai-os-full");
  if (existsSync(join(legacyRoot, "package.json"))) {
    return legacyRoot;
  }
  return standardSource;
}

/** ver5.3 standard layout under `<installDir>/runtime`. */
export function resolveCopilotRuntimePaths(): CopilotRuntimePaths {
  if (_cachedPaths) return _cachedPaths;

  const loc = resolveInstallLocation();
  const installRoot = loc.installDir;
  const runtimeRoot = loc.runtimeRoot;

  const hermes = resolveHermesLayout(runtimeRoot);
  const serve = resolveServeLayout(runtimeRoot);
  const portalRuntimeRoot = join(runtimeRoot, "portal");
  const portalSourceRoot = resolvePortalSourceRoot(portalRuntimeRoot, runtimeRoot);
  const portalNodeModules = existsSync(join(portalRuntimeRoot, "node_modules"))
    ? join(portalRuntimeRoot, "node_modules")
    : join(portalSourceRoot, "node_modules");

  _cachedPaths = {
    installRoot,
    runtimeRoot,
    downloadsRoot: join(installRoot, "downloads"),
    binDir: loc.binDir,

    hermesRuntimeRoot: hermes.hermesRuntimeRoot,
    hermesSourceRoot: hermes.hermesSourceRoot,
    hermesVenv: hermes.hermesVenv,
    hermesPython: join(hermes.hermesVenv, pythonBin()),
    hermesExe: join(hermes.hermesVenv, hermesExeBin()),

    serveRuntimeRoot: serve.serveRuntimeRoot,
    serveSourceRoot: serve.serveSourceRoot,
    serveVenv: serve.serveVenv,
    servePython: join(serve.serveVenv, pythonBin()),

    portalRuntimeRoot,
    portalSourceRoot,
    portalNodeModules,
  };

  return _cachedPaths;
}

export function clearCopilotRuntimePathCache(): void {
  _cachedPaths = null;
}

/** PRD §3 — env vars injected when spawning Hermes / Serve / Portal processes. */
export function buildCopilotRuntimeEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const paths = resolveCopilotRuntimePaths();
  const hermesHome = base.HERMES_HOME?.trim() || join(homedir(), ".hermes");

  return {
    ...base,
    COPILOT_INSTALL_ROOT: paths.installRoot,
    COPILOT_RUNTIME_ROOT: paths.runtimeRoot,
    COPILOT_DOWNLOADS_ROOT: paths.downloadsRoot,

    HERMES_RUNTIME_ROOT: paths.hermesRuntimeRoot,
    HERMES_SOURCE_ROOT: paths.hermesSourceRoot,
    HERMES_VENV: paths.hermesVenv,
    HERMES_PYTHON: paths.hermesPython,
    HERMES_HOME_ROOT: hermesHome,
    HERMES_HOME: hermesHome,

    COPILOT_SERVE_RUNTIME_ROOT: paths.serveRuntimeRoot,
    COPILOT_SERVE_ROOT: paths.serveSourceRoot,
    COPILOT_SERVE_VENV: paths.serveVenv,
    COPILOT_SERVE_PYTHON: paths.servePython,
    COPILOT_SERVE_PORT: base.COPILOT_SERVE_PORT ?? "8765",

    COPILOT_PORTAL_RUNTIME_ROOT:
      base.COPILOT_PORTAL_RUNTIME_ROOT?.trim() || paths.portalRuntimeRoot,
    COPILOT_PORTAL_ROOT:
      base.COPILOT_PORTAL_ROOT?.trim() ||
      resolveEffectivePortalMonorepoRoot() ||
      paths.portalSourceRoot,
    COPILOT_PORTAL_URL: base.COPILOT_PORTAL_URL ?? "http://127.0.0.1:3000",
    COPILOT_PORTAL_PORT: base.COPILOT_PORTAL_PORT ?? "3000",
  };
}
