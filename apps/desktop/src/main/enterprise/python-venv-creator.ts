import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_PYTHON_VERSION = "3.12";

export interface VenvCreateResult {
  ok: boolean;
  venvPath: string;
  errorCode?: string;
  message?: string;
}

function pythonExecutableInVenv(venvDir: string): string {
  const isWindows = process.platform === "win32";
  return isWindows
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
}

function tryExec(command: string, timeoutMs: number): boolean {
  try {
    execSync(command, { encoding: "utf-8", timeout: timeoutMs, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a Python venv — prefers `uv venv --python=3.12`, falls back to stdlib venv.
 */
export function createPythonVenv(
  venvDir: string,
  options?: { pythonVersion?: string },
): VenvCreateResult {
  const pythonVersion = options?.pythonVersion ?? DEFAULT_PYTHON_VERSION;
  mkdirSync(venvDir, { recursive: true });

  const uvCmd = `uv venv --python=${pythonVersion} "${venvDir}"`;
  if (tryExec(uvCmd, 120_000)) {
    if (existsSync(pythonExecutableInVenv(venvDir))) {
      return { ok: true, venvPath: venvDir };
    }
  }

  const fallbacks =
    process.platform === "win32"
      ? [`py -${pythonVersion} -m venv "${venvDir}"`, `python -m venv "${venvDir}"`]
      : [
          `python${pythonVersion} -m venv "${venvDir}"`,
          `python3 -m venv "${venvDir}"`,
          `python -m venv "${venvDir}"`,
        ];

  for (const cmd of fallbacks) {
    if (tryExec(cmd, 60_000) && existsSync(pythonExecutableInVenv(venvDir))) {
      return { ok: true, venvPath: venvDir };
    }
  }

  return {
    ok: false,
    venvPath: venvDir,
    errorCode: "E_VENV_CREATE_FAILED",
    message: "venv 创建失败：uv venv 与 python -m venv 均不可用",
  };
}
