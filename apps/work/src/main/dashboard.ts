import { type ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import http from "http";
import https from "https";
import { getConnectionConfig, readEnv, type ConnectionConfig } from "./config";
import { dashboardWebSocketUrlForRenderer } from "./dashboard-websocket-relay";
import {
  buildRemoteOAuthWsUrl,
  mintRemoteOAuthWsTicket,
  probeRemoteAuthMode,
  remoteOAuthSessionState,
  requestRemoteOAuthJson,
} from "./remote-oauth";
import { ensureSshTunnel, getSshTunnelUrl } from "./ssh-tunnel";
import { sshEnsureDashboard } from "./ssh-remote";
import {
  getActiveProfileNameSync,
  normalizeProfileName,
} from "./utils";

export interface DashboardConnection {
  baseUrl: string;
  wsUrl: string;
  token: string;
  authMode?: "token" | "oauth";
  mode: "local" | "remote" | "ssh";
  profile?: string;
  pid?: number;
  port?: number;
  logPath?: string;
  alreadyRunning?: boolean;
}

export interface DashboardStatus {
  supported: boolean;
  running: boolean;
  connection?: DashboardConnection;
  error?: string;
  logPath?: string;
  needsOAuthLogin?: boolean;
}

interface ManagedDashboard {
  proc: ChildProcess;
  connection: DashboardConnection;
}

const dashboards = new Map<string, ManagedDashboard>();

/** Default local Hermes dashboard port (matches SSH default profile). */
export const LOCAL_DASHBOARD_DEFAULT_PORT = 9119;

/**
 * Knowledge first-create fail-closed message when no attachable local dashboard.
 * Work does not spawn/kill local dashboard (managed data-plane); attach-only.
 */
export const KNOWLEDGE_DASHBOARD_REQUIRED_LOCAL =
  "KNOWLEDGE_DASHBOARD_REQUIRED: Local Hermes Dashboard is not available to attach. Knowledge first create needs a running dashboard; Work does not start it.";

export type LocalDashboardAttachCandidates = {
  port: number;
  token: string;
  baseUrl: string;
};

function resolveProfile(profile?: string): string | undefined {
  return normalizeProfileName(profile ?? getActiveProfileNameSync());
}

function profileKey(profile?: string): string {
  return resolveProfile(profile) ?? "default";
}

function dashboardWsUrl(baseUrl: string, token: string): string {
  const url = new URL("/api/ws", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function parseDashboardPort(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt((raw || "").trim(), 10);
  if (Number.isInteger(n) && n > 0 && n < 65536) return n;
  return fallback;
}

/**
 * Resolve port + session token for Knowledge local attach-only.
 * Does not spawn processes. Token/port from process.env then profile/.env then default home .env.
 */
export function resolveLocalDashboardAttachCandidates(
  profile?: string,
): LocalDashboardAttachCandidates | { error: string } {
  const resolved = resolveProfile(profile);
  const profileEnv = readEnv(resolved);
  const defaultEnv = resolved ? readEnv(undefined) : profileEnv;

  const token = firstNonEmpty(
    process.env.HERMES_DASHBOARD_SESSION_TOKEN,
    profileEnv.HERMES_DASHBOARD_SESSION_TOKEN,
    defaultEnv.HERMES_DASHBOARD_SESSION_TOKEN,
  );
  if (!token) {
    return {
      error:
        "KNOWLEDGE_DASHBOARD_REQUIRED: Local Hermes Dashboard session token not found (HERMES_DASHBOARD_SESSION_TOKEN).",
    };
  }

  const port = parseDashboardPort(
    firstNonEmpty(
      process.env.HERMES_DESKTOP_DASHBOARD_PORT,
      profileEnv.HERMES_DESKTOP_DASHBOARD_PORT,
      defaultEnv.HERMES_DESKTOP_DASHBOARD_PORT,
    ),
    LOCAL_DASHBOARD_DEFAULT_PORT,
  );
  const baseUrl = `http://127.0.0.1:${port}`;
  return { port, token, baseUrl };
}

/**
 * Probe an already-running local Hermes Dashboard. Never spawns or kills.
 */
export async function attachExistingLocalDashboard(
  profile?: string,
): Promise<DashboardStatus> {
  const candidates = resolveLocalDashboardAttachCandidates(profile);
  if ("error" in candidates) {
    return {
      supported: true,
      running: false,
      error: candidates.error,
    };
  }

  const resolvedProfile = resolveProfile(profile);
  const connection: DashboardConnection = {
    baseUrl: candidates.baseUrl,
    wsUrl: dashboardWsUrl(candidates.baseUrl, candidates.token),
    token: candidates.token,
    authMode: "token",
    mode: "local",
    profile: resolvedProfile,
    port: candidates.port,
    alreadyRunning: true,
  };

  try {
    const status = await requestJson(
      `${connection.baseUrl}/api/status`,
      connection.token,
    );
    if (dashboardStatusRequiresOAuth(status)) {
      return {
        supported: true,
        running: false,
        connection,
        error:
          "KNOWLEDGE_DASHBOARD_REQUIRED: Local dashboard requires OAuth; token attach is not available.",
      };
    }
    await requestJson(
      `${connection.baseUrl}/api/sessions?limit=1`,
      connection.token,
    );
    await probeDashboardWebSocket(connection);
    return {
      supported: true,
      running: true,
      connection: {
        ...connection,
        // Renderer must use the Main relay URL (same as freshDashboardWebSocketUrl).
        wsUrl: await dashboardWebSocketUrlForRenderer(connection.wsUrl),
        alreadyRunning: true,
      },
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      supported: true,
      running: false,
      connection,
      error: `${KNOWLEDGE_DASHBOARD_REQUIRED_LOCAL} (${detail})`,
    };
  }
}

/**
 * Knowledge Chat Dashboard entry: remote/SSH unchanged; local is attach-only.
 * Ordinary Chat must keep calling {@link startDashboard} (local stays stubbed).
 */
export async function attachLocalDashboardForKnowledge(
  profile?: string,
): Promise<DashboardStatus> {
  const config = getConnectionConfig();
  const mode =
    config.mode === "remote" || config.mode === "ssh" ? config.mode : "local";
  if (mode === "remote")
    return getRemoteDashboardStatusForConfig(config, profile);
  if (mode === "ssh") return getSshDashboardStatusForConfig(config, profile);
  return attachExistingLocalDashboard(profile);
}

function normalizeRemoteDashboardBaseUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (url.pathname === "/v1" || url.pathname === "/api") {
      url.pathname = "";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function remoteDashboardConnectionFromConfig(
  config: ConnectionConfig,
  profile?: string,
): DashboardConnection | null {
  if (config.mode !== "remote") return null;
  const baseUrl = normalizeRemoteDashboardBaseUrl(config.remoteUrl);
  const token = config.apiKey.trim();
  const authMode = config.remoteAuthMode === "oauth" ? "oauth" : "token";
  if (!baseUrl || (authMode === "token" && !token)) return null;
  return {
    baseUrl,
    wsUrl: authMode === "oauth" ? "" : dashboardWsUrl(baseUrl, token),
    token: authMode === "oauth" ? "" : token,
    authMode,
    mode: "remote",
    profile: resolveProfile(profile),
  };
}

export function sshDashboardConnectionFromTunnel(
  config: ConnectionConfig,
  baseUrl: string | null,
  token: string,
  profile?: string,
): DashboardConnection | null {
  if (config.mode !== "ssh") return null;
  const normalizedBaseUrl = normalizeRemoteDashboardBaseUrl(baseUrl || "");
  const cleanToken = token.trim();
  if (!normalizedBaseUrl || !cleanToken) return null;
  return {
    baseUrl: normalizedBaseUrl,
    wsUrl: dashboardWsUrl(normalizedBaseUrl, cleanToken),
    token: cleanToken,
    authMode: "token",
    mode: "ssh",
    profile: resolveProfile(profile),
  };
}

async function sshDashboardConnectionFromConfig(
  config: ConnectionConfig,
  profile?: string,
): Promise<DashboardConnection | null> {
  if (config.mode !== "ssh" || !config.ssh) return null;

  // Start `hermes dashboard` on the remote and tunnel to it (full parity with
  // local mode). NB: the dashboard is NOT a /v1 superset — web_server.py has no
  // /v1 chat routes (those live only on the gateway api_server, port 8642).
  // This tunnel serves the /api/* set and the /api/ws chat WebSocket, gated by
  // the dashboard session token, which is the SSH credential here. Returns
  // null when the remote can't run the dashboard (no Node / no web dist) —
  // the caller then falls back to legacy over the gateway /v1 tunnel.
  const dash = await sshEnsureDashboard(config.ssh, profile);
  if (!dash) return null;

  await ensureSshTunnel({ ...config.ssh, remotePort: dash.port });
  return sshDashboardConnectionFromTunnel(
    config,
    getSshTunnelUrl(),
    dash.token,
    profile,
  );
}

function requestJson(
  url: string,
  token: string,
  timeoutMs = 2_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(
      parsed,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Session-Token": token,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("error", reject);
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(
              new Error(`${res.statusCode}: ${text || res.statusMessage}`),
            );
            return;
          }
          if (!text) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timed out requesting ${url}`));
    });
    req.end();
  });
}

export function probeDashboardWebSocket(
  connection: DashboardConnection,
  timeoutMs = 2_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(connection.wsUrl);
    const client = parsed.protocol === "wss:" ? https : http;
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    const req = client.request(parsed, {
      method: "GET",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        "Sec-WebSocket-Version": "13",
      },
    });

    let settled = false;
    const finish = (err?: Error): void => {
      if (settled) return;
      settled = true;
      req.destroy();
      if (err) reject(err);
      else resolve();
    };

    req.on("upgrade", (_res, socket) => {
      socket.destroy();
      finish();
    });
    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8").trim();
        finish(
          new Error(
            `Hermes dashboard chat WebSocket is unavailable (${res.statusCode}${
              body ? `: ${body.slice(0, 160)}` : ""
            })`,
          ),
        );
      });
    });
    req.on("error", (err) => finish(err));
    req.setTimeout(timeoutMs, () => {
      finish(
        new Error(
          `Timed out connecting to Hermes dashboard chat WebSocket after ${timeoutMs}ms`,
        ),
      );
    });
    req.end();
  });
}

function dashboardStatusRequiresOAuth(status: unknown): boolean {
  return (
    typeof status === "object" &&
    status !== null &&
    (status as { auth_required?: unknown }).auth_required === true
  );
}

function errorNeedsOAuthLogin(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { needsOAuthLogin?: unknown }).needsOAuthLogin === true
  );
}

export async function getRemoteDashboardStatusForConfig(
  config: ConnectionConfig,
  profile?: string,
): Promise<DashboardStatus> {
  if (config.remoteChatTransport === "legacy") {
    return {
      supported: false,
      running: false,
      error: "Remote dashboard transport is disabled in Settings.",
    };
  }

  const baseUrl = normalizeRemoteDashboardBaseUrl(config.remoteUrl);
  if (!baseUrl) {
    return {
      supported: true,
      running: false,
      error: "Remote dashboard transport needs a valid dashboard URL.",
    };
  }

  let connection: DashboardConnection | undefined;
  try {
    const detected = await probeRemoteAuthMode(baseUrl);
    connection =
      remoteDashboardConnectionFromConfig(
        { ...config, remoteAuthMode: detected.authMode },
        profile,
      ) ?? undefined;

    if (detected.authMode === "oauth") {
      if (!connection) throw new Error("Could not resolve remote OAuth URL.");
      const sessionState = await remoteOAuthSessionState(baseUrl);
      if (!sessionState.signedIn) {
        return {
          supported: true,
          running: false,
          connection,
          needsOAuthLogin: true,
          error: "Sign in with your browser to connect to this remote gateway.",
        };
      }

      await requestRemoteOAuthJson(`${baseUrl}/api/sessions?limit=1`);
      const ticket = await mintRemoteOAuthWsTicket(baseUrl);
      await probeDashboardWebSocket({
        ...connection,
        wsUrl: buildRemoteOAuthWsUrl(baseUrl, ticket),
      });
      return { supported: true, running: true, connection };
    }

    if (!connection) {
      return {
        supported: true,
        running: false,
        error:
          "Remote dashboard transport needs a session token for this gateway.",
      };
    }

    await requestJson(
      `${connection.baseUrl}/api/sessions?limit=1`,
      connection.token,
    );
    await probeDashboardWebSocket(connection);

    return { supported: true, running: true, connection };
  } catch (err) {
    return {
      supported: true,
      running: false,
      connection,
      needsOAuthLogin: errorNeedsOAuthLogin(err),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getSshDashboardStatusForConfig(
  config: ConnectionConfig,
  profile?: string,
): Promise<DashboardStatus> {
  if (config.sshChatTransport === "legacy") {
    return {
      supported: false,
      running: false,
      error: "SSH dashboard transport is disabled in Settings.",
    };
  }

  if (!config.ssh?.host || !config.ssh.username) {
    return {
      supported: true,
      running: false,
      error: "SSH dashboard transport needs a configured host and username.",
    };
  }

  let connection: DashboardConnection | null = null;
  try {
    connection = await sshDashboardConnectionFromConfig(config, profile);
  } catch (err) {
    return {
      supported: true,
      running: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!connection) {
    return {
      supported: true,
      running: false,
      error:
        "SSH dashboard transport needs an active tunnel and API_SERVER_KEY on the remote Hermes host.",
    };
  }

  try {
    const status = await requestJson(
      `${connection.baseUrl}/api/status`,
      connection.token,
    );
    if (dashboardStatusRequiresOAuth(status)) {
      return {
        supported: true,
        running: false,
        connection,
        error:
          "SSH dashboard requires OAuth browser authentication. Token-based dashboard over SSH is supported now; OAuth ticket flow is not wired in SMC Copilot yet.",
      };
    }

    await requestJson(
      `${connection.baseUrl}/api/sessions?limit=1`,
      connection.token,
    );
    await probeDashboardWebSocket(connection);

    return { supported: true, running: true, connection };
  } catch (err) {
    return {
      supported: true,
      running: false,
      connection,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getDashboardStatus(
  profile?: string,
): Promise<DashboardStatus> {
  const config = getConnectionConfig();
  const mode =
    config.mode === "remote" || config.mode === "ssh" ? config.mode : "local";
  if (mode === "remote")
    return getRemoteDashboardStatusForConfig(config, profile);
  if (mode === "ssh") return getSshDashboardStatusForConfig(config, profile);

  // Ordinary Chat / Settings: Work does not own local dashboard lifecycle.
  return {
    supported: false,
    running: false,
    error: "Local dashboard process is not owned by Work.",
  };
}

export async function freshDashboardWebSocketUrl(
  profile?: string,
): Promise<string> {
  const config = getConnectionConfig();
  if (config.mode === "remote") {
    const baseUrl = normalizeRemoteDashboardBaseUrl(config.remoteUrl);
    if (!baseUrl) throw new Error("Remote dashboard URL is invalid.");
    const detected = await probeRemoteAuthMode(baseUrl);
    if (detected.authMode === "oauth") {
      const ticket = await mintRemoteOAuthWsTicket(baseUrl);
      return dashboardWebSocketUrlForRenderer(
        buildRemoteOAuthWsUrl(baseUrl, ticket),
      );
    }
    const connection = remoteDashboardConnectionFromConfig(
      { ...config, remoteAuthMode: "token" },
      profile,
    );
    if (!connection) {
      throw new Error("Remote dashboard session token is missing.");
    }
    return dashboardWebSocketUrlForRenderer(connection.wsUrl);
  }

  const status = await getDashboardStatus(profile);
  if (!status.running || !status.connection?.wsUrl) {
    throw new Error(status.error || "Dashboard WebSocket is unavailable.");
  }
  return dashboardWebSocketUrlForRenderer(status.connection.wsUrl);
}

export async function startDashboard(
  profile?: string,
): Promise<DashboardStatus> {
  const config = getConnectionConfig();
  const mode =
    config.mode === "remote" || config.mode === "ssh" ? config.mode : "local";
  if (mode === "remote")
    return getRemoteDashboardStatusForConfig(config, profile);
  if (mode === "ssh") return getSshDashboardStatusForConfig(config, profile);

  // Ordinary Chat keeps Legacy fallback on local; do not spawn or attach here.
  return {
    supported: false,
    running: false,
    error: "Local dashboard process is not owned by Work.",
  };
}

export function stopDashboard(profile?: string): boolean {
  const key = profileKey(profile);
  const managed = dashboards.get(key);
  if (!managed) return true;
  dashboards.delete(key);
  try {
    managed.proc.kill();
  } catch {
    return false;
  }
  return true;
}

export function stopAllDashboards(): void {
  for (const key of [...dashboards.keys()]) {
    stopDashboard(key === "default" ? undefined : key);
  }
}
