import { release, platform, freemem, totalmem } from "node:os";
import { accessSync, constants, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

import type {
  DeploymentConfig,
  PreflightCheckResult,
  PreflightReport,
} from "../../shared/enterprise/enterprise-schema";

import type { PreflightSeverity, PreflightStatus } from "../../shared/enterprise/enterprise-constants";

import { validateDeploymentConfig } from "./deployment-schema";
import { getHermesBasePath } from "./deployment-config";

function createCheck(
  id: string,
  severity: PreflightSeverity,
  status: PreflightStatus,
  message: string,
  durationMs: number,
  detail?: string,
): PreflightCheckResult {
  return { id, severity, status, message, detail, durationMs };
}

function runTimed<T>(fn: () => T): { result: T; durationMs: number } {
  const start = Date.now();
  const result = fn();
  return { result, durationMs: Date.now() - start };
}

async function runTimedAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

function checkWindowsVersion(): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    if (platform() !== "win32") {
      return { status: "fail" as PreflightStatus, message: `不支持的操作系统: ${platform()}` };
    }
    const ver = release();
    const major = parseInt(ver.split(".")[0], 10);
    if (major < 10) {
      return { status: "fail" as PreflightStatus, message: `Windows 版本过低: ${ver}, 需要 10+` };
    }
    return { status: "pass" as PreflightStatus, message: `Windows 版本: ${ver}` };
  });
  return createCheck("P0-WIN-VERSION", "P0", result.status, result.message, durationMs);
}

function checkDiskSpace(): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    const free = freemem();
    const required = 2 * 1024 * 1024 * 1024;
    if (free < required) {
      return {
        status: "fail" as PreflightStatus,
        message: `磁盘空间不足: 可用 ${Math.round(free / 1024 / 1024 / 1024)}GB, 需要 2GB`,
      };
    }
    return {
      status: "pass" as PreflightStatus,
      message: `磁盘空间充足: ${Math.round(free / 1024 / 1024 / 1024)}GB 可用`,
    };
  });
  return createCheck("P0-DISK-SPACE", "P0", result.status, result.message, durationMs);
}

function checkDirWritable(dirPath: string, id: string, label: string): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    try {
      mkdirSync(dirPath, { recursive: true });
      const testFile = join(dirPath, `.write-test-${Date.now()}`);
      accessSync(dirPath, constants.W_OK);
      return { status: "pass" as PreflightStatus, message: `${label} 可写` };
    } catch (err) {
      return {
        status: "fail" as PreflightStatus,
        message: `${label} 不可写: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
  return createCheck(id, "P0", result.status, result.message, durationMs);
}

function checkPorts(ports: number[]): PreflightCheckResult[] {
  return ports.map((port) => {
    const { result, durationMs } = runTimed(() => {
      try {
        const server = require("node:net").createServer();
        server.listen(port, "127.0.0.1");
        server.close();
        return { status: "pass" as PreflightStatus, message: `端口 ${port} 可用` };
      } catch {
        return { status: "fail" as PreflightStatus, message: `端口 ${port} 被占用` };
      }
    });
    return createCheck(`P0-PORT-${port}`, "P0", result.status, result.message, durationMs);
  });
}

function checkPython(): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    try {
      const out = execSync("python --version 2>&1", { encoding: "utf-8", timeout: 5000 }).trim();
      return { status: "pass" as PreflightStatus, message: `Python: ${out}` };
    } catch {
      try {
        const out = execSync("python3 --version 2>&1", { encoding: "utf-8", timeout: 5000 }).trim();
        return { status: "pass" as PreflightStatus, message: `Python3: ${out}` };
      } catch {
        return { status: "fail" as PreflightStatus, message: "未检测到 Python" };
      }
    }
  });
  return createCheck("P0-PYTHON-AVAILABLE", "P0", result.status, result.message, durationMs);
}

function checkVenvCreatable(pythonPath: string): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    const tempDir = join(homedir(), ".hermes", `_venv-test-${Date.now()}`);
    try {
      execSync(`"${pythonPath}" -m venv "${tempDir}"`, { encoding: "utf-8", timeout: 15000 });
      return { status: "pass" as PreflightStatus, message: "venv 可创建" };
    } catch (err) {
      return {
        status: "fail" as PreflightStatus,
        message: `venv 创建失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
  return createCheck("P0-VENV-CREATABLE", "P0", result.status, result.message, durationMs);
}

function checkDeploySchema(config: DeploymentConfig): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    const validation = validateDeploymentConfig(config);
    if (validation.ok) {
      return { status: "pass" as PreflightStatus, message: "deployment.json schema 合法" };
    }
    return {
      status: "fail" as PreflightStatus,
      message: `schema 校验失败: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    };
  });
  return createCheck("P0-DEPLOY-SCHEMA", "P0", result.status, result.message, durationMs);
}

function checkWinEol(): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    const ver = release();
    const major = parseInt(ver.split(".")[0], 10);
    if (major === 10) {
      return {
        status: "warn" as PreflightStatus,
        message: "Windows 10 已过官方支持期 (2025-10-14), 建议升级到 Windows 11",
      };
    }
    return { status: "pass" as PreflightStatus, message: "Windows 版本在支持期内" };
  });
  return createCheck("P1-WIN-EOL", "P1", result.status, result.message, durationMs);
}

function checkOllama(): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    try {
      execSync("ollama --version 2>&1", { encoding: "utf-8", timeout: 5000 });
      return { status: "pass" as PreflightStatus, message: "Ollama 已安装" };
    } catch {
      return { status: "warn" as PreflightStatus, message: "未检测到 Ollama, AI 推理需手动安装" };
    }
  });
  return createCheck("P1-OLLAMA-MISSING", "P1", result.status, result.message, durationMs);
}

function checkPyPI(url: string): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    try {
      const { execSync: sync } = require("node:child_process");
      sync(`curl -s -o /dev/null -w "%{http_code}" ${url} --connect-timeout 3`, { encoding: "utf-8", timeout: 5000 });
      return { status: "pass" as PreflightStatus, message: "PyPI 索引可达" };
    } catch {
      return { status: "warn" as PreflightStatus, message: "PyPI 索引不可达, 将使用 wheelhouse" };
    }
  });
  return createCheck("P1-PYPI-UNREACHABLE", "P1", result.status, result.message, durationMs);
}

function checkGit(): PreflightCheckResult {
  const { result, durationMs } = runTimed(() => {
    try {
      const out = execSync("git --version 2>&1", { encoding: "utf-8", timeout: 5000 }).trim();
      return { status: "info" as PreflightStatus, message: `Git: ${out}` };
    } catch {
      return { status: "warn" as PreflightStatus, message: "Git 不可用 (release-zip 模式可忽略)" };
    }
  });
  return createCheck("P1-GIT-UNAVAILABLE", "P1", result.status, result.message, durationMs);
}

function checkInfoItems(): PreflightCheckResult[] {
  const checks: PreflightCheckResult[] = [];

  {
    const { result, durationMs } = runTimed(() => {
      const ver = release();
      return { status: "info" as PreflightStatus, message: `OS: ${platform()} ${ver}` };
    });
    checks.push(createCheck("P2-WIN-VERSION-DETAIL", "P2", result.status, result.message, durationMs));
  }

  {
    const { result, durationMs } = runTimed(() => {
      try {
        const out = execSync("python --version 2>&1", { encoding: "utf-8", timeout: 5000 }).trim();
        return { status: "info" as PreflightStatus, message: out };
      } catch {
        return { status: "info" as PreflightStatus, message: "Python 未安装" };
      }
    });
    checks.push(createCheck("P2-PYTHON-VERSION", "P2", result.status, result.message, durationMs));
  }

  {
    const { result, durationMs } = runTimed(() => {
      const hermesDir = join(homedir(), ".hermes");
      const exists = existsSync(hermesDir);
      return {
        status: "info" as PreflightStatus,
        message: `~/.hermes ${exists ? "已存在" : "不存在"}`,
      };
    });
    checks.push(createCheck("P2-HERMES-DIR-STATUS", "P2", result.status, result.message, durationMs));
  }

  return checks;
}

export async function runPreflight(config: DeploymentConfig): Promise<PreflightReport> {
  const allChecks: PreflightCheckResult[] = [];
  const startTotal = Date.now();

  const installBasePath = getHermesBasePath();
  const hermesHome = join(homedir(), ".hermes");
  const ports = Object.values(config.profiles.ports || {});

  const p0Checks: PreflightCheckResult[] = [
    checkWindowsVersion(),
    checkDiskSpace(),
    checkDirWritable(installBasePath, "P0-INSTALL-DIR-WRITABLE", installBasePath),
    checkDirWritable(hermesHome, "P0-HERMES-HOME-WRITABLE", "~/.hermes"),
    checkPython(),
    checkDeploySchema(config),
    ...checkPorts(ports.length > 0 ? ports : [8642, 8643, 8644, 8645, 8646, 8647, 8648]),
  ];

  const p1Checks: PreflightCheckResult[] = [
    checkWinEol(),
    checkOllama(),
    checkPyPI(config.runtime.pipIndexUrl),
    checkGit(),
  ];

  const p2Checks: PreflightCheckResult[] = checkInfoItems();

  allChecks.push(...p0Checks, ...p1Checks, ...p2Checks);

  const p0Passed = p0Checks.every((c) => c.status !== "fail" && c.status !== "unknown");
  const p1Warnings = p1Checks.filter((c) => c.status === "warn").length;
  const p2Infos = p2Checks.filter((c) => c.status === "info").length;

  return {
    checks: allChecks,
    p0Passed,
    p1Warnings,
    p2Infos,
    totalDurationMs: Date.now() - startTotal,
  };
}
