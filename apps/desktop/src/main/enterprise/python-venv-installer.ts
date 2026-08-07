import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { DeploymentConfig } from "../../shared/enterprise/enterprise-schema";
import { createPythonVenv } from "./python-venv-creator";
import { getDesktopAgentDir, getDesktopAgentRuntimeDir } from "./windows/path-resolver";
import { resolveInstallLocation } from "./windows/install-location-resolver";
import {
  discoverWheelhouseDirs,
  installHermesAgentDependencies,
} from "./agent-deps-installer";

export interface VenvResult {
  ok: boolean;
  venvPath?: string;
  pythonPath?: string;
  pipPath?: string;
  isNewVenv?: boolean;
  errorCode?: string;
  message?: string;
}

export function createOrReuseSharedVenv(
  config: DeploymentConfig,
): VenvResult {
  const runtimeDir = getDesktopAgentRuntimeDir();
  const venvPath = join(runtimeDir, "venv");
  const runtimeRoot = resolveInstallLocation().runtimeRoot;

  const isWindows = process.platform === "win32";
  const pythonExe = isWindows ? join(venvPath, "Scripts", "python.exe") : join(venvPath, "bin", "python");
  const pipExe = isWindows ? join(venvPath, "Scripts", "pip.exe") : join(venvPath, "bin", "pip");

  if (existsSync(pythonExe) && existsSync(pipExe)) {
    try {
      execSync(`"${pythonExe}" -c "import sys; print(sys.version)"`, { encoding: "utf-8", timeout: 5000 });
      return { ok: true, venvPath, pythonPath: pythonExe, pipPath: pipExe, isNewVenv: false };
    } catch {
      /* recreate below */
    }
  }

  if (config.runtime.useBundledPython) {
    const bundledPython = join(runtimeRoot, "python", isWindows ? "python.exe" : "bin/python3");
    if (existsSync(bundledPython)) {
      mkdirSync(venvPath, { recursive: true });
      try {
        execSync(`"${bundledPython}" -m venv "${venvPath}"`, { encoding: "utf-8", timeout: 30000 });
      } catch (err) {
        return {
          ok: false,
          errorCode: "E_VENV_CREATE_FAILED",
          message: `venv 创建失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  if (!existsSync(pythonExe)) {
    const result = createPythonVenv(venvPath);
    if (!result.ok) {
      return {
        ok: false,
        errorCode: result.errorCode,
        message: result.message,
      };
    }
  }

  if (!existsSync(pythonExe)) {
    return { ok: false, errorCode: "E_VENV_CREATE_FAILED", message: "venv 创建后 python 可执行文件不存在" };
  }

  return { ok: true, venvPath, pythonPath: pythonExe, pipPath: pipExe, isNewVenv: true };
}

export interface PipInstallProgress {
  message: string;
}

export type PipProgressCallback = (progress: PipInstallProgress) => void;

export function installPythonDependencies(
  config: DeploymentConfig,
  venvPath: string,
  agentPath: string,
  onProgress?: PipProgressCallback,
): { ok: boolean; errorCode?: string; message?: string } {
  const isWindows = process.platform === "win32";
  const pipExe = isWindows ? join(venvPath, "Scripts", "pip.exe") : join(venvPath, "bin", "pip");
  const pythonExe = isWindows
    ? join(venvPath, "Scripts", "python.exe")
    : join(venvPath, "bin", "python");

  const requirementsFile = join(agentPath, "requirements.txt");
  const setupPy = join(agentPath, "setup.py");
  const pyprojectToml = join(agentPath, "pyproject.toml");

  if (
    !existsSync(requirementsFile) &&
    !existsSync(pyprojectToml) &&
    !existsSync(setupPy)
  ) {
    return { ok: true, message: "无可安装的依赖文件" };
  }

  const wheelhouses = discoverWheelhouseDirs(agentPath);
  const hasWheelhouse =
    wheelhouses.length > 0 ||
    (config.runtime.preferWheelhouse &&
      config.runtime.wheelhousePath &&
      existsSync(config.runtime.wheelhousePath));

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      onProgress?.({ message: `安装依赖 (尝试 ${attempt}/2)...` });
      installHermesAgentDependencies(agentPath, pythonExe, pipExe, {
        offlineFirst: Boolean(hasWheelhouse),
        pipIndexUrl: config.runtime.pipIndexUrl,
        trustedHost: config.runtime.trustedHost,
      });
      return { ok: true };
    } catch (err) {
      if (attempt === 2) {
        return {
          ok: false,
          errorCode: "E_PIP_INSTALL_FAILED",
          message: `pip 依赖安装失败: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  return { ok: true };
}
