import type {
  AuditEventRecord,
  GatewayLogEntry,
  ProfileGatewayState,
  ProfileRole,
  ProfileRuntimeStatus,
  ProfileSummary,
  RuntimeType,
} from "../../../../shared/profile-runtime/profile-runtime-contract";
import { copilotServeFetch, type CopilotServeHttpConfig } from "./http-client";

/** Ensure Serve is reachable and return baseUrl-only config (token never in Renderer). */
export async function ensureCopilotServeConfig(): Promise<CopilotServeHttpConfig> {
  let status = await window.copilotServe.getStatus();
  if (status.status !== "running") {
    status = await window.copilotServe.start();
  }
  const connection = await window.copilotServe.getConnection();
  if (!connection) {
    throw new Error(status.lastError ?? "copilot-serve 未连接");
  }
  return { baseUrl: connection.baseUrl };
}

export interface ServeProfileResponse {
  id: string;
  name: string;
  type: string;
  display_name: string | null;
  role: string | null;
  role_name: string | null;
  description: string | null;
  hermes_home: string;
  profile_path: string;
  gateway_port: number;
  enabled: boolean;
  auto_start: boolean;
  status: string;
  gateway_pid: number | null;
  created_at: string;
  updated_at: string;
}

export interface ServeProfileStatusResponse {
  profile_id: string;
  status: string;
  gateway_port: number;
  gateway_pid: number | null;
  healthy: boolean;
  message: string | null;
}

export interface ServeProfileEventResponse {
  id: string;
  source: "task" | "audit";
  event_type: string;
  task_id: string | null;
  message: string | null;
  event_payload: string | null;
  created_at: string;
}

export interface ServeGatewayLogsResponse {
  gateway_id: string;
  profile_id: string;
  lines: string[];
  truncated: boolean;
}

function mapServeGatewayStatus(status: string): ProfileRuntimeStatus {
  switch (status) {
    case "running":
      return "running";
    case "starting":
    case "restarting":
      return "starting";
    case "error":
      return "failed";
    case "stopped":
      return "stopped";
    default:
      return "stopped";
  }
}

function mapServeRole(role: string | null): ProfileRole {
  return role === "aios-controller" ? "aios-controller" : "specialist";
}

export function serveStatusToGatewayState(row: ServeProfileStatusResponse): ProfileGatewayState {
  return {
    profileId: row.profile_id,
    status: mapServeGatewayStatus(row.status),
    port: row.gateway_port,
    pid: row.gateway_pid,
    baseUrl: `http://127.0.0.1:${row.gateway_port}`,
    lastError: row.healthy ? null : row.message,
  };
}

export function serveProfileToGatewayState(row: ServeProfileResponse): ProfileGatewayState {
  return {
    profileId: row.id,
    status: mapServeGatewayStatus(row.status),
    port: row.gateway_port,
    pid: row.gateway_pid,
    baseUrl: `http://127.0.0.1:${row.gateway_port}`,
    lastError: row.status === "error" ? "Gateway error" : null,
  };
}

export function serveProfileToSummary(row: ServeProfileResponse): ProfileSummary {
  return {
    id: row.id,
    name: row.name,
    display_name: row.display_name ?? row.role_name ?? row.name,
    role: mapServeRole(row.role),
    description: row.description,
    runtime_type: "hermes-local" as RuntimeType,
    profile_home: row.profile_path || row.hermes_home,
    enabled: row.enabled,
    auto_start: row.auto_start,
    sort_order: row.gateway_port,
    runtime_status: mapServeGatewayStatus(row.status),
    port: row.gateway_port,
    pid: row.gateway_pid,
    capabilities: [],
  };
}

export function serveEventToAuditEvent(
  row: ServeProfileEventResponse,
  profileId: string,
): AuditEventRecord {
  const isLifecycle =
    row.event_type.startsWith("profile_") ||
    row.source === "audit";
  return {
    id: row.id,
    event_type: isLifecycle ? "profile_runtime" : row.event_type,
    profile_id: profileId,
    source: "system",
    action: row.event_type,
    payload_json: row.event_payload,
    status: row.message ? "failed" : "success",
    error_message: row.message,
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(row.created_at).toISOString(),
  };
}

export function serveLogLinesToGatewayEntries(
  profileId: string,
  lines: string[],
): GatewayLogEntry[] {
  const now = new Date().toISOString();
  return lines.map((message) => ({
    timestamp: now,
    level: "stdout" as const,
    message,
    profileId,
  }));
}

export async function listServeProfiles(
  config: CopilotServeHttpConfig,
): Promise<ProfileSummary[]> {
  const rows = await copilotServeFetch<ServeProfileResponse[]>(config, "/api/v1/profiles");
  return rows.map(serveProfileToSummary).sort((a, b) => a.sort_order - b.sort_order);
}

export async function listServeProfileGatewayStates(
  config: CopilotServeHttpConfig,
): Promise<ProfileGatewayState[]> {
  const rows = await copilotServeFetch<ServeProfileResponse[]>(config, "/api/v1/profiles");
  return rows.map(serveProfileToGatewayState);
}

export async function probeServeProfileHealth(
  config: CopilotServeHttpConfig,
  profileId: string,
): Promise<{ healthy: boolean }> {
  const row = await copilotServeFetch<ServeProfileStatusResponse>(
    config,
    `/api/v1/profiles/${profileId}/health`,
  );
  return { healthy: row.healthy };
}

export async function startServeProfile(
  config: CopilotServeHttpConfig,
  profileId: string,
): Promise<ServeProfileStatusResponse> {
  return copilotServeFetch<ServeProfileStatusResponse>(
    config,
    `/api/v1/profiles/${profileId}/start`,
    { method: "POST" },
  );
}

export async function stopServeProfile(
  config: CopilotServeHttpConfig,
  profileId: string,
): Promise<ServeProfileStatusResponse> {
  return copilotServeFetch<ServeProfileStatusResponse>(
    config,
    `/api/v1/profiles/${profileId}/stop`,
    { method: "POST" },
  );
}

export async function restartServeProfile(
  config: CopilotServeHttpConfig,
  profileId: string,
): Promise<ServeProfileStatusResponse> {
  return copilotServeFetch<ServeProfileStatusResponse>(
    config,
    `/api/v1/profiles/${profileId}/restart`,
    { method: "POST" },
  );
}

/** 启动所有 enabled 且 auto_start 的 profile（与 Main 进程 startAllProfiles 语义一致）。 */
export async function startAllServeProfiles(
  config: CopilotServeHttpConfig,
): Promise<void> {
  const profiles = await listServeProfiles(config);
  const targets = profiles.filter((p) => p.enabled && p.auto_start);
  for (const p of targets) {
    if (p.runtime_status === "stopped" || p.runtime_status === "failed") {
      await startServeProfile(config, p.id);
    }
  }
}

/** 停止所有 running / starting 的 profile。 */
export async function stopAllServeProfiles(
  config: CopilotServeHttpConfig,
): Promise<void> {
  const profiles = await listServeProfiles(config);
  for (const p of profiles) {
    if (p.runtime_status === "running" || p.runtime_status === "starting") {
      await stopServeProfile(config, p.id);
    }
  }
}

export async function getServeGatewayLogs(
  config: CopilotServeHttpConfig,
  profileId: string,
  tail = 80,
): Promise<GatewayLogEntry[]> {
  const res = await copilotServeFetch<ServeGatewayLogsResponse>(
    config,
    `/api/v1/gateways/${profileId}/logs?tail=${tail}`,
  );
  return serveLogLinesToGatewayEntries(profileId, res.lines);
}

export async function listServeProfileEvents(
  config: CopilotServeHttpConfig,
  profileId: string,
  limit = 40,
): Promise<AuditEventRecord[]> {
  const rows = await copilotServeFetch<ServeProfileEventResponse[]>(
    config,
    `/api/v1/profiles/${profileId}/events?limit=${limit}`,
  );
  return rows
    .map((row) => serveEventToAuditEvent(row, profileId))
    .filter(
      (e) =>
        e.action.startsWith("profile_") ||
        e.event_type === "profile_runtime",
    );
}
