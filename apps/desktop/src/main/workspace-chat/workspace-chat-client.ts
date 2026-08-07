/**
 * Workspace Chat Runtime client — Profile → Instance → instance chat / Chat Runtime v2.
 * Forbidden: /profiles/*/chat/* (PRD v1.1 §9–§10).
 */
import type { CopilotServeConnection } from "../../shared/copilot-serve/copilot-serve-contract";
import type {
  ChatModelListResponse,
  ProfileChatModelConfig,
  ResolvedProfile,
  SetProfileChatModelConfigPayload,
  UploadWorkspaceAttachmentsResponse,
  WorkspaceChatSendPayload,
} from "../../shared/workspace-chat/workspace-chat-contract";
import {
  getCopilotServeConnection,
  startCopilotServeProcess,
} from "../copilot-serve/copilot-serve-process";
import {
  getDeviceTokenSync,
  getLegacySharedTokenSync,
} from "../copilot-runtime-client/runtime-auth-store";
import { instanceClient } from "../copilot-runtime-client/clients/instance-client";
import { getSmcRuntimeClient } from "../copilot-runtime-client/smc-runtime-client";

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

/** Resolve profile/instance ref → Instance, then map to Workspace ResolvedProfile. */
export async function resolveProfileRef(ref: string): Promise<ResolvedProfile> {
  const resolved = await instanceClient.resolve(ref);
  const instanceId = resolved.instanceId;
  if (!instanceId) {
    throw new Error(`Unable to resolve instance for ref: ${ref}`);
  }
  let name = ref;
  try {
    const inst = await instanceClient.get(instanceId);
    name = inst.name || inst.profileRef || instanceId;
  } catch {
    /* keep ref */
  }
  return {
    profile_id: instanceId,
    name,
    matched_by: resolved.matchedBy,
  } as ResolvedProfile;
}

export async function resolveInstanceId(profileOrInstanceRef: string): Promise<string> {
  const resolved = await instanceClient.resolve(profileOrInstanceRef);
  if (!resolved.instanceId) {
    throw new Error(`Unable to resolve instance for: ${profileOrInstanceRef}`);
  }
  return resolved.instanceId;
}

export async function listChatModels(profileId: string): Promise<ChatModelListResponse> {
  const instanceId = await resolveInstanceId(profileId);
  const raw = await getSmcRuntimeClient().transport.request<ChatModelListResponse>({
    path: `/api/v1/instances/${encodeURIComponent(instanceId)}/chat/models`,
  });
  return { ...raw, profile_id: profileId };
}

export async function getChatModelConfig(
  profileId: string,
): Promise<ProfileChatModelConfig | null> {
  const instanceId = await resolveInstanceId(profileId);
  const raw = await getSmcRuntimeClient().transport.request<Record<string, unknown> | null>({
    path: `/api/v1/instances/${encodeURIComponent(instanceId)}/chat/model-config`,
  });
  if (!raw) return null;
  return {
    profile_id: profileId,
    provider: String(raw.provider ?? ""),
    model_id: String(raw.model_id ?? raw.modelId ?? ""),
    model_label: (raw.model_label ?? raw.modelLabel ?? null) as string | null,
    base_url: (raw.base_url ?? raw.baseUrl ?? null) as string | null,
    updated_at: (raw.updated_at ?? raw.updatedAt ?? null) as string | null,
  };
}

export async function setChatModelConfig(
  profileId: string,
  payload: SetProfileChatModelConfigPayload,
): Promise<ProfileChatModelConfig> {
  const instanceId = await resolveInstanceId(profileId);
  const raw = await getSmcRuntimeClient().transport.request<Record<string, unknown>>({
    method: "PUT",
    path: `/api/v1/instances/${encodeURIComponent(instanceId)}/chat/model-config`,
    body: payload,
  });
  return {
    profile_id: profileId,
    provider: String(raw.provider ?? payload.provider ?? ""),
    model_id: String(raw.model_id ?? raw.modelId ?? payload.model_id ?? ""),
    model_label: (raw.model_label ?? raw.modelLabel ?? payload.model_label ?? null) as
      | string
      | null,
    base_url: (raw.base_url ?? raw.baseUrl ?? payload.base_url ?? null) as string | null,
    updated_at: (raw.updated_at ?? raw.updatedAt ?? null) as string | null,
  };
}

export async function removeChatAttachment(
  workspaceId: string,
  attachmentId: string,
): Promise<void> {
  await serveFetch<void>(`/api/v1/workspaces/${workspaceId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}

export async function chatCompletionsUrl(profileId: string): Promise<string> {
  const conn = await ensureConnection();
  const instanceId = await resolveInstanceId(profileId);
  return `${conn.baseUrl.replace(/\/$/, "")}/api/v1/instances/${encodeURIComponent(instanceId)}/chat/completions`;
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
  try {
    const instanceId = await resolveInstanceId(profileId);
    await getSmcRuntimeClient().transport.request({
      method: "POST",
      path: `/api/v1/instances/${encodeURIComponent(instanceId)}/chat/abort`,
      query: { stream_id: streamId },
      body: {},
    });
  } catch {
    /* best-effort */
  }
}

export async function uploadAttachmentsMultipart(
  workspaceId: string,
  profileId: string,
  sessionId: string,
  filePaths: string[],
): Promise<UploadWorkspaceAttachmentsResponse> {
  const conn = await ensureConnection();
  const instanceId = await resolveInstanceId(profileId);
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const form = new FormData();
  form.append("profile_id", profileId);
  form.append("instance_id", instanceId);
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
