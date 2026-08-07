import { existsSync } from "fs";
import { execFile } from "child_process";
import { isAiOsInstalled, getAiOsPaths } from "./aios-paths";
import { getAiOsEnvConfig } from "./aios-config";
import { isPortAvailable } from "./aios-port-check";
import { checkServiceHealth } from "./aios-health";
import { resolveAiosBackendHealthUrl, resolveAiosBackendUrl } from "./aios-home-url";

export type DoctorCheckStatus = "pass" | "warning" | "error" | "skipped";

export interface DoctorCheckResult {
  name: string;
  status: DoctorCheckStatus;
  message: string;
  detail?: string;
}

export interface AiOsDoctorReport {
  timestamp: string;
  checks: DoctorCheckResult[];
  overallStatus: DoctorCheckStatus;
}

async function checkNodeInstalled(): Promise<DoctorCheckResult> {
  return new Promise((resolve) => {
    execFile("node", ["--version"], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ name: "Node.js", status: "error", message: "Node.js not found", detail: err.message });
      } else {
        const version = stdout.trim();
        const major = parseInt(version.replace("v", ""), 10);
        if (major < 18) {
          resolve({ name: "Node.js", status: "warning", message: `Node.js ${version} found (18+ recommended)` });
        } else {
          resolve({ name: "Node.js", status: "pass", message: `Node.js ${version}` });
        }
      }
    });
  });
}

async function checkPnpmInstalled(): Promise<DoctorCheckResult> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    execFile(cmd, ["--version"], { timeout: 5000, shell: true }, (err, stdout) => {
      if (err) {
        resolve({ name: "pnpm", status: "error", message: "pnpm not found", detail: err.message });
      } else {
        resolve({ name: "pnpm", status: "pass", message: `pnpm ${stdout.trim()}` });
      }
    });
  });
}

async function checkAiOsSourceInstalled(): Promise<DoctorCheckResult> {
  if (!isAiOsInstalled()) {
    return { name: "Portal Source", status: "error", message: "ai-os-full source not found" };
  }
  const paths = getAiOsPaths();
  const hasBackend = existsSync(paths.backendDir);
  const hasFrontend = existsSync(paths.frontendDir);
  if (!hasBackend || !hasFrontend) {
    return { name: "Portal Source", status: "warning", message: "Source found but backend/frontend dirs missing", detail: `backend: ${hasBackend}, frontend: ${hasFrontend}` };
  }
  return { name: "Portal Source", status: "pass", message: `Installed at ${paths.aiosRoot}` };
}

async function checkPortAvailability(): Promise<DoctorCheckResult> {
  const config = getAiOsEnvConfig();
  const port = config.frontendPort;

  if (!(await isPortAvailable(port))) {
    return {
      name: "Port Availability",
      status: "warning",
      message: `Frontend port ${port} in use`,
      detail: "Port may be occupied by a running Portal frontend or another application",
    };
  }
  return { name: "Port Availability", status: "pass", message: `Frontend port ${port} available` };
}

async function checkRemoteBackend(): Promise<DoctorCheckResult> {
  const backendUrl = resolveAiosBackendUrl();
  const healthUrl = resolveAiosBackendHealthUrl();
  const healthy = await checkServiceHealth(healthUrl);
  if (healthy) {
    return { name: "Portal Backend (remote)", status: "pass", message: `Reachable at ${backendUrl}` };
  }
  return {
    name: "Portal Backend (remote)",
    status: "warning",
    message: `Not reachable at ${healthUrl}`,
    detail: "Configure backend URL in login endpoint settings; Desktop does not start backend locally",
  };
}

async function checkGatewayHealth(): Promise<DoctorCheckResult> {
  const config = getAiOsEnvConfig();
  const healthy = await checkServiceHealth(`${config.hermesGatewayUrl}/health`);
  if (healthy) {
    return { name: "Hermes Gateway", status: "pass", message: "Gateway is healthy" };
  }
  return { name: "Hermes Gateway", status: "warning", message: "Gateway not reachable" };
}

export async function runAiOsDoctor(): Promise<AiOsDoctorReport> {
  const checks = await Promise.all([
    checkNodeInstalled(),
    checkPnpmInstalled(),
    checkAiOsSourceInstalled(),
    checkPortAvailability(),
    checkRemoteBackend(),
    checkGatewayHealth(),
  ]);

  let overallStatus: DoctorCheckStatus = "pass";
  for (const check of checks) {
    if (check.status === "error") { overallStatus = "error"; break; }
    if (check.status === "warning") overallStatus = "warning";
  }

  return {
    timestamp: new Date().toISOString(),
    checks,
    overallStatus,
  };
}
