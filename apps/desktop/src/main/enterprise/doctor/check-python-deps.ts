import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { DoctorCheckResult } from "../../../shared/enterprise/enterprise-schema";

export function checkPythonDeps(venvPath: string, agentPath: string): DoctorCheckResult {
  const start = Date.now();
  const isWindows = process.platform === "win32";
  const pythonExe = isWindows ? join(venvPath, "Scripts", "python.exe") : join(venvPath, "bin", "python");

  if (!existsSync(pythonExe)) {
    return { id: "python-deps", name: "Python 依赖完整性", status: "fail", message: "venv python 不存在", durationMs: Date.now() - start };
  }

  const reqFile = join(agentPath, "requirements.txt");
  if (!existsSync(reqFile)) {
    return { id: "python-deps", name: "Python 依赖完整性", status: "warn", message: "requirements.txt 不存在, 跳过", durationMs: Date.now() - start };
  }

  try {
    execSync(`"${pythonExe}" -c "import pkg_resources; pkg_resources.require(open('${reqFile}').read().splitlines())"`, { encoding: "utf-8", timeout: 15000 });
    return { id: "python-deps", name: "Python 依赖完整性", status: "pass", message: "依赖完整", durationMs: Date.now() - start };
  } catch (err) {
    return { id: "python-deps", name: "Python 依赖完整性", status: "fail", message: `依赖缺失: ${err instanceof Error ? err.message : String(err)}`, durationMs: Date.now() - start };
  }
}
