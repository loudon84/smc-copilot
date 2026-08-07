import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DoctorCheckResult } from "../../../shared/enterprise/enterprise-schema";
import type { EnterpriseErrorCode } from "../../../shared/enterprise/enterprise-constants";

const isWindows = process.platform === "win32";

export interface WindowsDoctorResult extends DoctorCheckResult {
  errorCode?: EnterpriseErrorCode;
  repairHint?: string;
}

export function checkWindowsPowerShell(): WindowsDoctorResult {
  const start = Date.now();
  if (!isWindows) {
    return { id: "win-powershell", name: "PowerShell 检查", status: "skip", message: "非 Windows 平台", durationMs: Date.now() - start };
  }
  try {
    const version = execSync("powershell -Command \"$PSVersionTable.PSVersion.ToString()\"", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    const policy = execSync("powershell -Command \"Get-ExecutionPolicy\"", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    const canRun = !["Restricted", "Undefined"].includes(policy);
    if (!canRun) {
      return {
        id: "win-powershell", name: "PowerShell 检查", status: "fail",
        message: `执行策略 ${policy} 阻止脚本运行 (PS ${version})`,
        durationMs: Date.now() - start,
        errorCode: "WIN_POWERSHELL_BLOCKED",
        repairHint: '以管理员运行: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser',
      };
    }
    return { id: "win-powershell", name: "PowerShell 检查", status: "pass", message: `PowerShell ${version}, 策略 ${policy}`, durationMs: Date.now() - start };
  } catch {
    return {
      id: "win-powershell", name: "PowerShell 检查", status: "fail",
      message: "PowerShell 不可用",
      durationMs: Date.now() - start,
      errorCode: "WIN_POWERSHELL_BLOCKED",
      repairHint: "确保 Windows PowerShell 5.1+ 已安装",
    };
  }
}

export function checkWindowsLongPaths(): WindowsDoctorResult {
  const start = Date.now();
  if (!isWindows) {
    return { id: "win-long-paths", name: "长路径支持", status: "skip", message: "非 Windows 平台", durationMs: Date.now() - start };
  }
  try {
    const result = execSync(
      "reg query HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem /v LongPathsEnabled",
      { encoding: "utf-8", timeout: 5000 },
    );
    if (result.includes("0x1")) {
      return { id: "win-long-paths", name: "长路径支持", status: "pass", message: "长路径已启用", durationMs: Date.now() - start };
    }
    return {
      id: "win-long-paths", name: "长路径支持", status: "warn",
      message: "长路径未启用 (可能导致路径超 260 字符失败)",
      durationMs: Date.now() - start,
      errorCode: "WIN_LONG_PATH_DISABLED",
      repairHint: '以管理员运行: reg add HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f',
    };
  } catch {
    return {
      id: "win-long-paths", name: "长路径支持", status: "warn",
      message: "无法检测长路径设置",
      durationMs: Date.now() - start,
      errorCode: "WIN_LONG_PATH_DISABLED",
    };
  }
}

export function checkHermesCmd(hermesCmdPath?: string): WindowsDoctorResult {
  const start = Date.now();
  const cmdPath = hermesCmdPath || (isWindows
    ? join(process.env.LOCALAPPDATA || "", "hermes", "bin", "hermes.cmd")
    : "hermes");
  try {
    const version = execSync(`${isWindows ? `"${cmdPath}"` : cmdPath} --version`, {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
    return { id: "hermes-cmd", name: "Hermes 命令", status: "pass", message: `hermes ${version}`, durationMs: Date.now() - start };
  } catch {
    if (existsSync(cmdPath)) {
      return {
        id: "hermes-cmd", name: "Hermes 命令", status: "fail",
        message: "hermes 命令存在但执行失败",
        durationMs: Date.now() - start,
        errorCode: "HERMES_INSTALL_INCOMPLETE",
        repairHint: "尝试重新安装 Hermes Agent",
      };
    }
    return {
      id: "hermes-cmd", name: "Hermes 命令", status: "fail",
      message: "hermes 命令未找到",
      durationMs: Date.now() - start,
      errorCode: "HERMES_CMD_NOT_FOUND",
      repairHint: "通过 Desktop 安装 Hermes Agent Runtime",
    };
  }
}

export function checkPythonVenv(venvPath: string): WindowsDoctorResult {
  const start = Date.now();
  const pythonBin = isWindows ? join(venvPath, "Scripts", "python.exe") : join(venvPath, "bin", "python");
  if (!existsSync(pythonBin)) {
    return {
      id: "python-venv", name: "Python venv", status: "fail",
      message: `Python venv 不存在: ${venvPath}`,
      durationMs: Date.now() - start,
      errorCode: "PYTHON_VENV_MISSING",
      repairHint: "通过 Desktop 重新创建 venv",
    };
  }
  try {
    const version = execSync(`"${pythonBin}" --version`, { encoding: "utf-8", timeout: 5000 }).trim();
    return { id: "python-venv", name: "Python venv", status: "pass", message: `${version} (${venvPath})`, durationMs: Date.now() - start };
  } catch {
    return {
      id: "python-venv", name: "Python venv", status: "fail",
      message: "venv Python 执行失败",
      durationMs: Date.now() - start,
      errorCode: "PYTHON_VENV_MISSING",
      repairHint: "删除 venv 目录后重新安装",
    };
  }
}

export function checkApiServer(host: string, port: number, apiKey?: string): WindowsDoctorResult {
  const start = Date.now();
  try {
    const healthUrl = `http://${host}:${port}/health`;
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" ${healthUrl}`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (result !== "200") {
      return {
        id: "api-server", name: "API Server", status: "fail",
        message: `API Server 未响应 (HTTP ${result})`,
        durationMs: Date.now() - start,
        errorCode: "API_SERVER_DISABLED",
        repairHint: "检查 .env 中 API_SERVER_ENABLED=true",
      };
    }
    if (apiKey) {
      const modelsUrl = `http://${host}:${port}/v1/models`;
      const authResult = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${apiKey}" ${modelsUrl}`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      if (authResult === "401" || authResult === "403") {
        return {
          id: "api-server", name: "API Server", status: "fail",
          message: `API Server 认证失败 (HTTP ${authResult})`,
          durationMs: Date.now() - start,
          errorCode: "API_SERVER_UNAUTHORIZED",
          repairHint: "检查 API_SERVER_KEY 配置",
        };
      }
    }
    return { id: "api-server", name: "API Server", status: "pass", message: `API Server 运行在 ${host}:${port}`, durationMs: Date.now() - start };
  } catch {
    return {
      id: "api-server", name: "API Server", status: "fail",
      message: "API Server 不可达",
      durationMs: Date.now() - start,
      errorCode: "API_SERVER_DISABLED",
      repairHint: "启动 Gateway: hermes gateway",
    };
  }
}

export function runWindowsDoctorChecks(): WindowsDoctorResult[] {
  if (!isWindows) return [];
  return [
    checkWindowsPowerShell(),
    checkWindowsLongPaths(),
  ];
}
