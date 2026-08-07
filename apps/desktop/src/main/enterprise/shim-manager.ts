import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCopilotServePort } from "../copilot-serve/copilot-serve-paths";
import { resolveCopilotRuntimePaths } from "../runtime/runtime-paths";
import { resolveEffectivePortalMonorepoRoot } from "../runtime/portal-root-resolver";
import { findPnpm } from "../utils/pnpm-resolver";

const CRLF = "\r\n";

function writeCmdFile(filePath: string, content: string): void {
  const dir = join(filePath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content, "utf-8");
}

export function createDesktopShim(binDir: string, installDir: string): void {
  const exePath = join(installDir, "desktop.exe");
  const launchLine = `@echo off${CRLF}"${exePath}" %*${CRLF}`;
  writeCmdFile(join(binDir, "desktop.cmd"), launchLine);
  writeCmdFile(join(binDir, "smc-copilot.cmd"), launchLine);
  writeCmdFile(join(binDir, "hermes-desktop.cmd"), launchLine);
}

export function createPlaceholderHermesShim(binDir: string): void {
  const content = `@echo off${CRLF}echo Hermes Agent is not yet installed. Please launch SMC-Copilot to complete setup.${CRLF}`;
  writeCmdFile(join(binDir, "hermes.cmd"), content);
}

export function createPlaceholderServeShim(binDir: string): void {
  const content = `@echo off${CRLF}echo Copilot Serve is not yet installed. Please launch SMC-Copilot to complete setup.${CRLF}`;
  writeCmdFile(join(binDir, "serve.cmd"), content);
}

export function createPlaceholderPortalShim(binDir: string): void {
  const content = `@echo off${CRLF}echo Portal is not yet installed. Please launch SMC-Copilot to complete setup.${CRLF}`;
  writeCmdFile(join(binDir, "portal.cmd"), content);
}

export function updateHermesShim(
  binDir: string,
  installRoot: string,
  paths: ReturnType<typeof resolveCopilotRuntimePaths>,
): void {
  const content = [
    "@echo off",
    `set COPILOT_INSTALL_ROOT=${installRoot}`,
    `set COPILOT_RUNTIME_ROOT=${paths.runtimeRoot}`,
    `set HERMES_RUNTIME_ROOT=${paths.hermesRuntimeRoot}`,
    `set HERMES_SOURCE_ROOT=${paths.hermesSourceRoot}`,
    `set HERMES_VENV=${paths.hermesVenv}`,
    `set HERMES_PYTHON=${paths.hermesPython}`,
    "set HERMES_HOME_ROOT=%USERPROFILE%\\.hermes",
    "set HERMES_HOME=%USERPROFILE%\\.hermes",
    `"${paths.hermesExe}" %*`,
    "",
  ].join(CRLF);
  writeCmdFile(join(binDir, "hermes.cmd"), content);
}

export function updateServeShim(
  binDir: string,
  installRoot: string,
  paths: ReturnType<typeof resolveCopilotRuntimePaths>,
): void {
  const port = getCopilotServePort();
  const content = [
    "@echo off",
    `set COPILOT_INSTALL_ROOT=${installRoot}`,
    `set COPILOT_RUNTIME_ROOT=${paths.runtimeRoot}`,
    `set COPILOT_SERVE_RUNTIME_ROOT=${paths.serveRuntimeRoot}`,
    `set COPILOT_SERVE_ROOT=${paths.serveSourceRoot}`,
    `set COPILOT_SERVE_VENV=${paths.serveVenv}`,
    `set COPILOT_SERVE_PYTHON=${paths.servePython}`,
    `set COPILOT_SERVE_PORT=${port}`,
    `"${paths.servePython}" -m uvicorn main:app --app-dir src --host 127.0.0.1 --port ${port} %*`,
    "",
  ].join(CRLF);
  writeCmdFile(join(binDir, "serve.cmd"), content);
}

export function updatePortalShim(
  binDir: string,
  installRoot: string,
  paths: ReturnType<typeof resolveCopilotRuntimePaths>,
): void {
  const pnpm = findPnpm();
  const portalRoot =
    resolveEffectivePortalMonorepoRoot() ?? paths.portalSourceRoot;
  const content = [
    "@echo off",
    `set COPILOT_INSTALL_ROOT=${installRoot}`,
    `set COPILOT_RUNTIME_ROOT=${paths.runtimeRoot}`,
    `set COPILOT_PORTAL_RUNTIME_ROOT=${paths.portalRuntimeRoot}`,
    `set COPILOT_PORTAL_ROOT=${portalRoot}`,
    "set COPILOT_PORTAL_URL=http://127.0.0.1:3000",
    "set COPILOT_PORTAL_PORT=3000",
    `cd /d "${portalRoot}"`,
    `"${pnpm}" --filter @portal/web start %*`,
    "",
  ].join(CRLF);
  writeCmdFile(join(binDir, "portal.cmd"), content);
}

export function ensureShims(): void {
  const paths = resolveCopilotRuntimePaths();

  if (!existsSync(paths.binDir)) {
    mkdirSync(paths.binDir, { recursive: true });
  }

  createDesktopShim(paths.binDir, paths.installRoot);

  if (existsSync(paths.hermesExe)) {
    updateHermesShim(paths.binDir, paths.installRoot, paths);
  } else {
    createPlaceholderHermesShim(paths.binDir);
  }

  if (existsSync(paths.servePython) && existsSync(join(paths.serveSourceRoot, "pyproject.toml"))) {
    updateServeShim(paths.binDir, paths.installRoot, paths);
  } else {
    createPlaceholderServeShim(paths.binDir);
  }

  const portalRoot = resolveEffectivePortalMonorepoRoot();
  if (portalRoot) {
    updatePortalShim(paths.binDir, paths.installRoot, paths);
  } else {
    createPlaceholderPortalShim(paths.binDir);
  }
}
