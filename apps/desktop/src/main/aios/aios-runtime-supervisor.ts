import { randomUUID } from "crypto";
import { BrowserWindow } from "electron";
import { isAiOsInstalled, buildPortalNotInstalledMessage, clearPathCache } from "./aios-paths";
import { clearCopilotRuntimePathCache } from "../runtime/runtime-paths";
import { writeAiOsEnvFile, getAiOsEnvConfig } from "./aios-config";
import { resolveAiosHomeUrl, resolveAiosBackendUrl, resolveAiosBackendHealthUrl, parseBackendPortFromUrl } from "./aios-home-url";
import { spawnFrontend, killProcess, killAllProcesses, getProcess } from "./aios-process";
import { checkPortalHealth, checkServiceHealth, waitForHealth } from "./aios-health";
import {
  upsertRuntimeService,
  updateRuntimeServiceStatus,
  getRuntimeService,
  listRuntimeServices,
  insertRuntimeServiceEvent,
} from "../profile-runtime-db";
import type {
  AiOsRuntimeSnapshot,
  AiOsServiceId,
  AiOsRuntimeStatus,
  RuntimeServiceRecord,
  RuntimeServiceStatus,
} from "../../shared/aios/aios-contract";

const SUPERVISION_INTERVAL_MS = 15_000;
let supervisionTimer: NodeJS.Timeout | null = null;

function emitStatusChange(win: BrowserWindow | null, serviceId: AiOsServiceId, prev: RuntimeServiceStatus, next: RuntimeServiceStatus, reason?: string): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send("aios:runtime-changed", {
      serviceId,
      previousStatus: prev,
      newStatus: next,
      reason,
      timestamp: new Date().toISOString(),
    });
  }
}

function logEvent(serviceId: string, eventType: string, message: string, level: "info" | "warn" | "error" = "info"): void {
  insertRuntimeServiceEvent({
    id: randomUUID(),
    service_id: serviceId,
    event_type: eventType,
    level,
    message,
    payload_json: null,
  });
}

function setStatus(serviceId: AiOsServiceId, status: RuntimeServiceStatus, extra?: Parameters<typeof updateRuntimeServiceStatus>[2]): void {
  updateRuntimeServiceStatus(serviceId, status, extra);
}

function computeOverallStatus(services: { status: RuntimeServiceStatus }[]): RuntimeServiceStatus {
  if (services.length === 0) return "not_installed";
  if (services.every((s) => s.status === "running")) return "running";
  if (services.some((s) => s.status === "error")) return "error";
  if (services.some((s) => s.status === "starting")) return "starting";
  if (services.some((s) => s.status === "stopping")) return "stopping";
  if (services.every((s) => s.status === "stopped")) return "stopped";
  return "degraded";
}

export function initAiOsServices(): void {
  const config = getAiOsEnvConfig();

  const copilotServePort = Number(process.env.COPILOT_SERVE_PORT ?? "8765");
  const backendUrl = resolveAiosBackendUrl();
  const backendPort = parseBackendPortFromUrl(backendUrl, config.backendPort);

  const seed: Array<{ id: AiOsServiceId; type: string; name: string; port: number | null; url: string | null }> = [
    { id: "hermes-gateway", type: "hermes-gateway", name: "Hermes Gateway", port: 8642, url: "http://127.0.0.1:8642" },
    { id: "aios-backend", type: "aios-backend", name: "Portal Backend (remote)", port: backendPort, url: backendUrl },
    { id: "aios-frontend", type: "aios-frontend", name: "Portal Frontend", port: config.frontendPort, url: `http://127.0.0.1:${config.frontendPort}` },
    {
      id: "copilot-serve",
      type: "copilot-serve",
      name: "Copilot Serve",
      port: copilotServePort,
      url: `http://127.0.0.1:${copilotServePort}`,
    },
  ];

  for (const s of seed) {
    const existing = getRuntimeService(s.id);
    if (!existing) {
      upsertRuntimeService({
        service_id: s.id,
        service_type: s.type,
        display_name: s.name,
        status: "stopped",
        pid: null,
        port: s.port,
        url: s.url,
        install_path: null,
        started_at: null,
        stopped_at: null,
        last_health_at: null,
        last_error: null,
        restart_count: 0,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

export function getAiOsRuntimeStatus(): AiOsRuntimeStatus {
  const services = listRuntimeServices();
  return {
    services,
    overall: computeOverallStatus(services),
  };
}

// Dynamic service configuration based on Portal env config
// This allows ports to be customized via configuration
function getSnapshotServiceDefs(): Array<{
  id: AiOsServiceId;
  displayName: string;
  port: number;
  baseUrl: string;
  healthUrl: string;
}> {
  const config = getAiOsEnvConfig();
  const backendUrl = resolveAiosBackendUrl();
  const backendHealthUrl = resolveAiosBackendHealthUrl();

  return [
    {
      id: "hermes-gateway",
      displayName: "Hermes Gateway",
      port: 8642,
      baseUrl: config.hermesGatewayUrl ?? "http://127.0.0.1:8642",
      healthUrl: `${config.hermesGatewayUrl ?? "http://127.0.0.1:8642"}/health`,
    },
    {
      id: "aios-backend",
      displayName: "Portal Backend (remote)",
      port: parseBackendPortFromUrl(backendUrl, config.backendPort),
      baseUrl: backendUrl,
      healthUrl: backendHealthUrl,
    },
    {
      id: "aios-frontend",
      displayName: "Portal Portal (configured)",
      port: parsePortalPort(resolveAiosHomeUrl(), config.frontendPort),
      baseUrl: resolveAiosHomeUrl(),
      // V3.3: health reflects login/bootstrap aiosHomeUrl, not only Desktop-spawned process
      healthUrl: resolveAiosHomeUrl(),
    },
    {
      id: "copilot-serve",
      displayName: "Copilot Serve",
      port: Number(process.env.COPILOT_SERVE_PORT ?? "8765"),
      baseUrl: `http://127.0.0.1:${process.env.COPILOT_SERVE_PORT ?? "8765"}`,
      healthUrl: `http://127.0.0.1:${process.env.COPILOT_SERVE_PORT ?? "8765"}/api/v1/health`,
    },
  ];
}

function parsePortalPort(homeUrl: string, fallbackPort: number): number {
  try {
    const parsed = new URL(homeUrl);
    if (parsed.port) {
      return Number(parsed.port);
    }
    return parsed.protocol === "https:" ? 443 : 80;
  } catch {
    return fallbackPort;
  }
}

function resolveSnapshotServiceStatus(
  serviceId: AiOsServiceId,
  healthy: boolean,
  dbRecord: ReturnType<typeof getRuntimeService>,
): RuntimeServiceStatus {
  if (healthy) return "running";
  if (serviceId === "aios-backend") return "degraded";
  if (dbRecord?.status === "error") return "error";
  return "stopped";
}

/** Live health probe — never returns an empty services list. */
export async function getAiOsRuntimeSnapshot(): Promise<AiOsRuntimeSnapshot> {
  const now = new Date().toISOString();
  const serviceDefs = getSnapshotServiceDefs();

  const services: RuntimeServiceRecord[] = await Promise.all(
    serviceDefs.map(async (def) => {
      const dbRecord = getRuntimeService(def.id);
      const healthy =
        def.id === "aios-frontend"
          ? await checkPortalHealth(def.healthUrl)
          : await checkServiceHealth(def.healthUrl);
      const status = resolveSnapshotServiceStatus(def.id, healthy, dbRecord);

      return {
        service_id: def.id,
        service_type: def.id,
        display_name: def.displayName,
        status,
        pid: dbRecord?.pid ?? null,
        port: def.port,
        url: def.baseUrl,
        install_path: dbRecord?.install_path ?? null,
        started_at: dbRecord?.started_at ?? null,
        stopped_at: healthy ? null : (dbRecord?.stopped_at ?? null),
        last_health_at: healthy ? now : (dbRecord?.last_health_at ?? null),
        last_error: healthy ? null : (dbRecord?.last_error ?? null),
        restart_count: dbRecord?.restart_count ?? 0,
        updated_at: now,
      };
    }),
  );

  const ready = services.some(
    (s) => s.service_id === "aios-frontend" && s.status === "running",
  );
  const webAppUrl = resolveAiosHomeUrl();

  return {
    services,
    ready,
    ...(ready ? { webAppUrl } : {}),
  };
}

async function probeRemoteBackend(
  mainWindow: BrowserWindow | null,
): Promise<void> {
  const backendUrl = resolveAiosBackendUrl();
  const healthUrl = resolveAiosBackendHealthUrl();
  const prev = getRuntimeService("aios-backend");
  const prevStatus = (prev?.status ?? "stopped") as RuntimeServiceStatus;

  setStatus("aios-backend", "starting");
  emitStatusChange(mainWindow, "aios-backend", prevStatus, "starting", "Remote health probe");
  logEvent("aios-backend", "remote-probe", `Probing ${healthUrl}`);

  const healthy = await checkServiceHealth(healthUrl);
  if (healthy) {
    setStatus("aios-backend", "running", {
      pid: null,
      url: backendUrl,
      last_health_at: new Date().toISOString(),
      last_error: null,
    });
    emitStatusChange(mainWindow, "aios-backend", "starting", "running");
    logEvent("aios-backend", "remote-healthy", "Remote backend is reachable");
    return;
  }

  setStatus("aios-backend", "degraded", {
    pid: null,
    url: backendUrl,
    last_error: `Remote backend not reachable at ${healthUrl}`,
  });
  emitStatusChange(mainWindow, "aios-backend", "starting", "degraded", "Remote backend unreachable");
  logEvent("aios-backend", "remote-unreachable", `Remote backend not reachable at ${healthUrl}`, "warn");
}

export async function startAiOs(mainWindow: BrowserWindow | null): Promise<AiOsRuntimeStatus> {
  clearPathCache();
  clearCopilotRuntimePathCache();
  if (!isAiOsInstalled()) {
    throw new Error(buildPortalNotInstalledMessage());
  }

  const config = getAiOsEnvConfig();

  // 1. Write .env (frontend uses remote backend URL — no local backend spawn)
  writeAiOsEnvFile();
  logEvent("aios-backend", "env-written", "Generated portal env for local frontend + remote backend");

  // 2. Remote backend — probe only, never spawn locally
  await probeRemoteBackend(mainWindow);

  // 3. Start frontend
  setStatus("aios-frontend", "starting");
  emitStatusChange(mainWindow, "aios-frontend", "stopped", "starting");

  const frontendResult = spawnFrontend();
  setStatus("aios-frontend", "starting", {
    pid: frontendResult.pid,
    started_at: new Date().toISOString(),
  });
  logEvent("aios-frontend", "process-started", `PID: ${frontendResult.pid}`);

  setupProcessExitHandler("aios-frontend", mainWindow);

  const frontendUrl = `http://127.0.0.1:${config.frontendPort}`;
  const frontendHealthy = await waitForHealth(frontendUrl, 90_000, 3000);
  if (!frontendHealthy) {
    setStatus("aios-frontend", "error", { last_error: "Frontend health check timed out" });
    emitStatusChange(mainWindow, "aios-frontend", "starting", "error", "Health timeout");
    logEvent("aios-frontend", "health-timeout", "Frontend did not become healthy within 90s", "error");
    return getAiOsRuntimeStatus();
  }

  setStatus("aios-frontend", "running", { last_health_at: new Date().toISOString() });
  emitStatusChange(mainWindow, "aios-frontend", "starting", "running");
  logEvent("aios-frontend", "running", "Frontend is healthy");

  // 5. Start supervision
  startSupervision(mainWindow);

  return getAiOsRuntimeStatus();
}

export async function stopAiOs(mainWindow: BrowserWindow | null): Promise<AiOsRuntimeStatus> {
  stopSupervision();

  for (const id of ["aios-frontend"] as AiOsServiceId[]) {
    const prev = getRuntimeService(id);
    if (prev && (prev.status === "running" || prev.status === "starting")) {
      setStatus(id, "stopping");
      emitStatusChange(mainWindow, id, prev.status as RuntimeServiceStatus, "stopping");
      killProcess(id);
      setStatus(id, "stopped", { stopped_at: new Date().toISOString(), pid: null });
      emitStatusChange(mainWindow, id, "stopping", "stopped");
      logEvent(id, "stopped", "Process stopped");
    }
  }

  return getAiOsRuntimeStatus();
}

export async function restartAiOs(mainWindow: BrowserWindow | null): Promise<AiOsRuntimeStatus> {
  await stopAiOs(mainWindow);
  return startAiOs(mainWindow);
}

function setupProcessExitHandler(serviceId: AiOsServiceId, mainWindow: BrowserWindow | null): void {
  const child = getProcess(serviceId);
  if (!child) return;

  child.on("exit", (code) => {
    const current = getRuntimeService(serviceId);
    if (current && current.status === "running") {
      setStatus(serviceId, "error", {
        last_error: `Process exited unexpectedly with code ${code}`,
        stopped_at: new Date().toISOString(),
        pid: null,
      });
      emitStatusChange(mainWindow, serviceId, "running", "error", `Unexpected exit (code ${code})`);
      logEvent(serviceId, "unexpected-exit", `Exit code: ${code}`, "error");
    }
  });
}

function startSupervision(mainWindow: BrowserWindow | null): void {
  stopSupervision();
  supervisionTimer = setInterval(async () => {
    const config = getAiOsEnvConfig();

    const backendHealthy = await checkServiceHealth(resolveAiosBackendHealthUrl());
    const backendSvc = getRuntimeService("aios-backend");
    if (backendSvc) {
      const nextStatus: RuntimeServiceStatus = backendHealthy ? "running" : "degraded";
      if (backendSvc.status !== nextStatus) {
        setStatus("aios-backend", nextStatus, {
          pid: null,
          url: resolveAiosBackendUrl(),
          last_health_at: backendHealthy ? new Date().toISOString() : backendSvc.last_health_at,
          last_error: backendHealthy ? null : "Remote backend health check failed",
        });
        emitStatusChange(mainWindow, "aios-backend", backendSvc.status as RuntimeServiceStatus, nextStatus);
      } else if (backendHealthy) {
        updateRuntimeServiceStatus("aios-backend", "running", {
          last_health_at: new Date().toISOString(),
        });
      }
    }

    const frontendUrl = `http://127.0.0.1:${config.frontendPort}`;
    const frontendSvc = getRuntimeService("aios-frontend");
    if (!frontendSvc || frontendSvc.status !== "running") return;

    const frontendHealthy = await checkServiceHealth(frontendUrl);
    if (frontendHealthy) {
      updateRuntimeServiceStatus("aios-frontend", "running", {
        last_health_at: new Date().toISOString(),
      });
    } else {
      setStatus("aios-frontend", "degraded", { last_error: "Health check failed" });
      emitStatusChange(mainWindow, "aios-frontend", "running", "degraded", "Health check failed");
      logEvent("aios-frontend", "health-failed", "Health check failed", "warn");
    }
  }, SUPERVISION_INTERVAL_MS);
}

function stopSupervision(): void {
  if (supervisionTimer) {
    clearInterval(supervisionTimer);
    supervisionTimer = null;
  }
}

export function onBeforeQuit(): void {
  stopSupervision();
  killAllProcesses();

  for (const id of ["aios-frontend"] as AiOsServiceId[]) {
    const svc = getRuntimeService(id);
    if (svc && svc.status === "running") {
      setStatus(id, "stopped", { stopped_at: new Date().toISOString(), pid: null });
    }
  }
}
