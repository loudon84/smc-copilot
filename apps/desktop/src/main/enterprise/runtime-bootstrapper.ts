import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

import type { DeploymentConfig } from "../../shared/enterprise/enterprise-schema";
import { getHermesBasePath } from "./deployment-config";

export interface RuntimeBootstrapResult {
  ok: boolean;
  pythonPath?: string;
  pythonVersion?: string;
  isBundled?: boolean;
  message?: string;
}

export function detectAndBootstrapRuntime(
  config: DeploymentConfig,
): RuntimeBootstrapResult {
  const basePath = getHermesBasePath();
  const isWindows = process.platform === "win32";

  if (config.runtime.useBundledPython) {
    const bundledPython = join(basePath, "runtime", "python", isWindows ? "python.exe" : "bin/python3");
    if (existsSync(bundledPython)) {
      try {
        const version = execSync(`"${bundledPython}" --version 2>&1`, { encoding: "utf-8", timeout: 5000 }).trim();
        return { ok: true, pythonPath: bundledPython, pythonVersion: version, isBundled: true };
      } catch {
      }
    }
  }

  for (const cmd of ["python3", "python"]) {
    try {
      const version = execSync(`${cmd} --version 2>&1`, { encoding: "utf-8", timeout: 5000 }).trim();
      const major = parseInt(version.replace(/Python\s+/i, "").split(".")[0], 10);
      if (major >= 3) {
        return { ok: true, pythonPath: cmd, pythonVersion: version, isBundled: false };
      }
    } catch {
    }
  }

  return { ok: false, message: "未检测到可用的 Python >= 3.x" };
}
