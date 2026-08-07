import type { CopilotServeConnection } from "../../shared/copilot-serve/copilot-serve-contract";
import type {
  ChatModelListResponse,
  ProfileChatModelConfig,
  ResolvedProfile,
  SetProfileChatModelConfigPayload,
  UploadWorkspaceAttachmentsResponse,
  WorkspaceChatSendPayload,
} from "../../shared/workspace-chat/workspace-chat-contract";
import { getCopilotServeConnection, startCopilotServeProcess } from "../copilot-serve/copilot-serve-process";
import {
  getDeviceTokenSync,
  getLegacySharedTokenSync,
} from "../copilot-runtime-client/runtime-auth-store";

async function ensureConnection(): Promise<CopilotServeConnection> {
  let conn = getCopilotServeConnection();
  if (!conn) {
    await startCopilotServeProcess();
    conn = getCopilotServeConnection();
  }
  if (!conn) {
    throw new Error("copilot-serve 未连接");
  }
  return conn;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
  const deviceToken = getDeviceTokenSync();
  if (deviceToken) {
    base.Authorization = `Bearer ${deviceToken}`;
  }
  const legacy = getLegacySharedTokenSync();
  if (legacy) {
    base["X-Copilot-Desktop-Token"] = legacy;
  }
  return base;
}

async function serveFetch<T>(
  path: string,
  init?: RequestInit & { parseJson?: boolean },
): Promise<T> {
  const conn = await ensureConnection();
  const url = `${conn.baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: headers(init?.headers as Record<string, string> | undefined),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text) as {
        message?: string;
        error?: { message?: string; code?: string };
      };
      message = body.error?.message ?? body.message ?? message;
    } catch {
      /* keep */
    }
    throw new Error(message);
  }
  if (res.status === 204 || init?.parseJson === false) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function resolveProfileRef(ref: string): Promise<ResolvedProfile> {
  const encoded = encodeURIComponent(ref);
  return serveFetch<ResolvedProfile>(`/api/v1/profiles/resolve?ref=${encoded}`);
}

export async function listChatModels(profileId: string): Promise<ChatModelListResponse> {
  return serveFetch<ChatModelListResponse>(`/api/v1/profiles/${profileId}/chat/models`);
}

export async function getChatModelConfig(
  profileId: string,
): Promise<ProfileChatModelConfig | null> {
  return serveFetch<ProfileChatModelConfig | null>(
    `/api/v1/profiles/${profileId}/chat/model-config`,
  );
}

export async function setChatModelConfig(
  profileId: string,
  payload: SetProfileChatModelConfigPayload,
): Promise<ProfileChatModelConfig> {
  return serveFetch<ProfileChatModelConfig>(
    `/api/v1/profiles/${profileId}/chat/model-config`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function removeChatAttachment(
  workspaceId: string,
  attachmentId: string,
): Promise<void> {
  await serveFetch<void>(
    `/api/v1/workspaces/${workspaceId}/attachments/${attachmentId}`,
    { method: "DELETE" },
  );
}

export function chatCompletionsUrl(profileId: string): string {
  const conn = getCopilotServeConnection();
  if (!conn) {
    throw new Error("copilot-serve 未连接");
  }
  return `${conn.baseUrl.replace(/\/$/, "")}/api/v1/profiles/${profileId}/chat/completions`;
}

export function chatCompletionsHeaders(): Record<string, string> {
  if (!getCopilotServeConnection()) {
    throw new Error("copilot-serve 未连接");
  }
  return headers({
    Accept: "text/event-stream",
  });
}

export async function abortChatStream(
  profileId: string,
  streamId: string,
): Promise<void> {
  const encoded = encodeURIComponent(streamId);
  await serveFetch<void>(
    `/api/v1/profiles/${profileId}/chat/abort?stream_id=${encoded}`,
    { method: "POST" },
  ).catch(() => {
    /* best-effort */
  });
}

export async function uploadAttachmentsMultipart(
  workspaceId: string,
  profileId: string,
  sessionId: string,
  filePaths: string[],
): Promise<UploadWorkspaceAttachmentsResponse> {
  const conn = await ensureConnection();
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const form = new FormData();
  form.append("profile_id", profileId);
  form.append("session_id", sessionId);
  for (const filePath of filePaths) {
    const buf = await readFile(filePath);
    const name = basename(filePath);
    form.append("files", new Blob([buf]), name);
  }
  const url = `${conn.baseUrl.replace(/\/$/, "")}/api/v1/workspaces/${workspaceId}/attachments`;
  const hdrs: Record<string, string> = { Accept: "application/json" };
  const deviceToken = getDeviceTokenSync();
  if (deviceToken) {
    hdrs.Authorization = `Bearer ${deviceToken}`;
  }
  const legacy = getLegacySharedTokenSync();
  if (legacy) {
    hdrs["X-Copilot-Desktop-Token"] = legacy;
  }
  const res = await fetch(url, { method: "POST", headers: hdrs, body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as UploadWorkspaceAttachmentsResponse;
}

export type { WorkspaceChatSendPayload };
