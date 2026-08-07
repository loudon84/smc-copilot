import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

import type { DeploymentConfig, DoctorCheckResult, DoctorReport, InstallMarker } from "../../../shared/enterprise/enterprise-schema";
import type { DoctorCheckStatus } from "../../../shared/enterprise/enterprise-constants";

import { checkGatewayReachable } from "./check-gateway-reachable";
import { checkPythonDeps } from "./check-python-deps";
import { checkAgentFiles } from "./check-agent-files";
import { checkProfileDb } from "./check-profile-db";
import { checkSkills } from "./check-skills";
import { checkPolicy, checkPortBinding, checkDirPermission, checkConfigValidity } from "./check-misc";
import { runWindowsDoctorChecks, checkHermesCmd, checkPythonVenv, checkApiServer } from "./check-windows";
import { resolveInstallLocation } from "../windows/install-location-resolver";

export interface DoctorInput {
  config: DeploymentConfig;
  marker?: InstallMarker | null;
  profileId?: string;
}

export async function runAllChecks(input: DoctorInput): Promise<DoctorReport> {
  const { config, marker } = input;
  const startTotal = Date.now();
  const checks: DoctorCheckResult[] = [];

  const hermesHome = join(homedir(), ".hermes");
  const loc = resolveInstallLocation();
  const agentDir = loc.agentDir;
  const venvDir = join(agentDir, "venv");
  const defaultPort = config.profiles.ports?.default || 8642;

  const checkPromises: Promise<DoctorCheckResult>[] = [
    checkGatewayReachable(config.gateway.host, defaultPort).catch((err) => makeErrorCheck("gateway-reachable", "Gateway 可达性", err)),
    Promise.resolve().then(() => checkPythonDeps(venvDir, agentDir)),
    Promise.resolve().then(() => checkAgentFiles(agentDir)),
    Promise.resolve().then(() => checkProfileDb(join(hermesHome, "desktop", "profile-runtime.db"))),
    Promise.resolve().then(() => checkSkills(join(hermesHome, "skills"))),
    Promise.resolve().then(() => checkPolicy("default")),
    Promise.resolve().then(() => checkPortBinding(config.gateway.host, defaultPort)),
    Promise.resolve().then(() => checkDirPermission(loc.runtimeRoot)),
    Promise.resolve().then(() => checkConfigValidity(join(hermesHome, "config.yaml"))),
    Promise.resolve().then(() => checkHermesCmd()),
    Promise.resolve().then(() => checkPythonVenv(venvDir)),
    Promise.resolve().then(() => checkApiServer(config.gateway.host, defaultPort)),
    ...runWindowsDoctorChecks().map((r) => Promise.resolve(r as DoctorCheckResult)),
  ];

  const results = await Promise.allSettled(checkPromises);
  for (const result of results) {
    if (result.status === "fulfilled") {
      checks.push(result.value);
    } else {
      checks.push(makeErrorCheck("unknown", "未知检查", result.reason));
    }
  }

  const overallStatus: DoctorCheckStatus = checks.some((c) => c.status === "fail" || c.status === "error")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "pass";

  return {
    id: randomUUID(),
    checks,
    overallStatus,
    createdAt: new Date().toISOString(),
    totalDurationMs: Date.now() - startTotal,
  };
}

function makeErrorCheck(id: string, name: string, err: unknown): DoctorCheckResult {
  return {
    id,
    name,
    status: "error",
    message: `检查异常: ${err instanceof Error ? err.message : String(err)}`,
    durationMs: 0,
  };
}

export function exportDoctorReport(report: DoctorReport, exportDir?: string): { ok: boolean; path: string } {
  const dir = exportDir || join(resolveInstallLocation().runtimeRoot, "logs");
  const path = join(dir, `doctor-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  try {
    writeFileSync(path, JSON.stringify(report, null, 2), "utf-8");
    return { ok: true, path };
  } catch (err) {
    return { ok: false, path: "" };
  }
}
