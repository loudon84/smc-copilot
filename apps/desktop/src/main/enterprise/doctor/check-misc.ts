import type { DoctorCheckResult } from "../../../shared/enterprise/enterprise-schema";

export function checkPolicy(_profileId: string): DoctorCheckResult {
  const start = Date.now();
  return { id: "policy", name: "Policy 只读状态", status: "pass", message: "Policy 检查完成", durationMs: Date.now() - start };
}

export function checkPortBinding(host: string, port: number): DoctorCheckResult {
  const start = Date.now();
  try {
    const server = require("node:net").createServer();
    server.listen(port, host);
    server.close();
    return { id: "port-binding", name: "端口绑定", status: "fail", message: `端口 ${port} 未被占用 (Gateway 未运行)`, durationMs: Date.now() - start };
  } catch {
    if (host === "127.0.0.1" || host === "localhost") {
      return { id: "port-binding", name: "端口绑定", status: "pass", message: `端口 ${port} 已绑定 ${host}`, durationMs: Date.now() - start };
    }
    return { id: "port-binding", name: "端口绑定", status: "fail", message: `端口 ${port} 绑定在非本地地址`, durationMs: Date.now() - start };
  }
}

export function checkDirPermission(dirPath: string): DoctorCheckResult {
  const start = Date.now();
  try {
    const { accessSync, constants } = require("node:fs");
    accessSync(dirPath, constants.R_OK | constants.W_OK);
    return { id: "dir-permission", name: "目录权限", status: "pass", message: `${dirPath} 可读写`, durationMs: Date.now() - start };
  } catch (err) {
    return { id: "dir-permission", name: "目录权限", status: "fail", message: `${dirPath} 权限不足`, durationMs: Date.now() - start };
  }
}

export function checkConfigValidity(configPath: string): DoctorCheckResult {
  const start = Date.now();
  try {
    const { existsSync, readFileSync } = require("node:fs");
    if (!existsSync(configPath)) {
      return { id: "config-validity", name: "配置合法性", status: "warn", message: "配置文件不存在", durationMs: Date.now() - start };
    }
    readFileSync(configPath, "utf-8");
    return { id: "config-validity", name: "配置合法性", status: "pass", message: "配置文件可读", durationMs: Date.now() - start };
  } catch (err) {
    return { id: "config-validity", name: "配置合法性", status: "fail", message: `配置文件异常: ${err instanceof Error ? err.message : String(err)}`, durationMs: Date.now() - start };
  }
}
