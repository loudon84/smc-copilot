import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getCachedAccessToken } from "../auth/token-store";
import { readAuthEndpointConfig } from "../auth/auth-endpoint-config-store";
import { getDeviceIdentity } from "../genehub/device-identity";
import { getExpertRun, listExpertRuns } from "./expert-runtime-db";
import { getExpertInstanceByProfileId } from "./expert-runtime-db";

export type ExpertDesktopSyncStatus = {
  registered: boolean;
  desktopId?: string;
  lastHeartbeatAt?: string;
  lastError?: string;
  lastRegisterAt?: string;
};

const SESSION_FILE = () => join(app.getPath("userData"), "hermes-experts-desktop.json");

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let syncStatus: ExpertDesktopSyncStatus = { registered: false };

function readSession(): { desktopId?: string; token?: string } {
  const path = SESSION_FILE();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as { desktopId?: string; token?: string };
  } catch {
    return {};
  }
}

function writeSession(session: { desktopId?: string; token?: string }): void {
  const path = SESSION_FILE();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(session, null, 2), "utf-8");
}

function backendBaseUrl(): string | null {
  const config = readAuthEndpointConfig();
  return config?.backendUrl?.replace(/\/+$/, "") ?? null;
}

export function getExpertDesktopSyncStatus(): ExpertDesktopSyncStatus {
  return { ...syncStatus };
}

export async function registerExpertDesktop(): Promise<ExpertDesktopSyncStatus> {
  const base = backendBaseUrl();
  const accessToken = getCachedAccessToken();
  if (!base || !accessToken) {
    syncStatus = {
      registered: false,
      lastError: "Login required for desktop sync",
    };
    return getExpertDesktopSyncStatus();
  }

  try {
    const identity = getDeviceIdentity();
    const res = await fetch(`${base}/api/v1/hermes/desktop/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        deviceFingerprint: identity.deviceFingerprint,
        appVersion: app.getVersion(),
        capabilities: ["expert_profiles", "expert_runs"],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      syncStatus = {
        registered: false,
        lastError: text || `Register failed (${res.status})`,
      };
      return getExpertDesktopSyncStatus();
    }

    const body = (await res.json()) as { desktop_id?: string; desktopId?: string; token?: string };
    const desktopId = body.desktop_id ?? body.desktopId;
    writeSession({ desktopId, token: body.token });
    syncStatus = {
      registered: true,
      desktopId,
      lastRegisterAt: new Date().toISOString(),
      lastError: undefined,
    };
    return getExpertDesktopSyncStatus();
  } catch (err) {
    syncStatus = {
      registered: false,
      lastError: err instanceof Error ? err.message : String(err),
    };
    return getExpertDesktopSyncStatus();
  }
}

async function sendHeartbeat(): Promise<void> {
  const base = backendBaseUrl();
  const accessToken = getCachedAccessToken();
  const session = readSession();
  if (!base || !accessToken || !session.desktopId) return;

  const profiles = listExpertRuns({ limit: 100 })
    .map((r) => r.activeProfileId)
    .filter((id, idx, arr) => arr.indexOf(id) === idx)
    .map((profileId) => {
      const inst = getExpertInstanceByProfileId(profileId);
      return {
        profileId,
        expertId: inst?.expertId,
        status: inst?.status ?? "unknown",
        gatewayPort: inst?.gatewayPort,
      };
    });

  try {
    const res = await fetch(`${base}/api/v1/hermes/desktop/${session.desktopId}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        appVersion: app.getVersion(),
        expertProfiles: profiles,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      syncStatus.lastHeartbeatAt = new Date().toISOString();
      syncStatus.lastError = undefined;
    } else {
      syncStatus.lastError = `Heartbeat failed (${res.status})`;
    }
  } catch (err) {
    syncStatus.lastError = err instanceof Error ? err.message : String(err);
  }
}

export function startExpertDesktopHeartbeat(): void {
  if (heartbeatTimer) return;
  void registerExpertDesktop().then(() => sendHeartbeat());
  heartbeatTimer = setInterval(() => {
    void sendHeartbeat();
  }, 60_000);
}

export function stopExpertDesktopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export async function reportExpertRunIfConfigured(runId: string): Promise<void> {
  const base = backendBaseUrl();
  const accessToken = getCachedAccessToken();
  const session = readSession();
  if (!base || !accessToken || !session.desktopId) return;

  const run = getExpertRun(runId);
  if (!run) return;

  try {
    await fetch(`${base}/api/v1/hermes/desktop/${session.desktopId}/expert-runs/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        runId: run.runId,
        runType: run.runType,
        expertId: run.expertId,
        teamId: run.teamId,
        profileId: run.activeProfileId,
        status: run.status,
        title: run.title,
        userPrompt: run.userPrompt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        events: run.events?.map((e) => ({
          eventType: e.eventType,
          createdAt: e.createdAt,
        })),
        artifacts: run.artifacts?.map((a) => ({
          title: a.title,
          artifactType: a.artifactType,
          source: a.source,
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    /* best-effort remote report */
  }
}
