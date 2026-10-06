import { BrowserWindow } from "electron";
import {
  isRemoteExpertCallable,
  REMOTE_EXPERT_IPC_CHANNELS,
  RemoteExpertError,
  sanitizeRemoteExpertDto,
  UUID_RE,
  type RemoteAcpSessionRef,
  type RemoteExpertPermissionOption,
  type RemoteExpertSemanticEvent,
  type RemoteExpertTurnRequest,
} from "../../shared/remote-expert";
import {
  createAuthorizedBackendTransport,
  resolveBackendBaseUrl,
} from "../auth/authorized-backend-transport";
import { ensureFreshAccessToken } from "../auth/ensure-access-token";
import { readStoredSessionSync } from "../auth/token-store";
import { ensureCompatibleContract } from "./remote-expert-contract-gate";
import {
  fetchRemoteExpertByRef,
  fetchRemoteExpertCatalog,
} from "./remote-expert-catalog-client";
import { RemoteAcpClient } from "./remote-acp-client";
import {
  collectArtifactResourceLinks,
  mapAcpSessionUpdate,
} from "./acp-event-mapper";
import {
  getRemoteAcpSessionRef,
  upsertRemoteAcpSessionRef,
} from "./remote-expert-session-store";
import { materializeRemoteExpertTurn } from "./remote-expert-transcript";
import {
  buildPromptBlocks,
  prepareAttachmentResourceLinks,
} from "./remote-attachment-client";
import { upsertRemoteExpertAcpArtifact } from "./remote-artifact-client";
import { emitRemoteExpertLog, logRemoteExpertError } from "./remote-expert-log";

type Runtime = {
  client: RemoteAcpClient;
  authGeneration: string;
  orgId: string;
  agentRef: string;
  desktopSessionId: string;
  pendingPermission?: {
    requestId: string;
    meta: unknown;
    authGeneration: string;
    resolved: boolean;
  };
  assistantText: string;
  reasoningText: string;
  turnId: string;
};

const runtimes = new Map<string, Runtime>();
let getMainWindow: () => BrowserWindow | null = () => null;

export function setRemoteExpertWindowGetter(
  getter: () => BrowserWindow | null,
): void {
  getMainWindow = getter;
}

function emitToRenderer(event: RemoteExpertSemanticEvent): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(
    REMOTE_EXPERT_IPC_CHANNELS.ON_EVENT,
    sanitizeRemoteExpertDto(event),
  );
}

function currentOrgId(): string {
  const org = readStoredSessionSync()?.user.currentOrgId?.trim() ?? "";
  if (!org) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_ORG_REQUIRED",
      "currentOrgId required",
    );
  }
  return org;
}

function persistRef(
  runtime: Runtime,
  state: RemoteAcpSessionRef["connectionState"],
  acpSessionId = runtime.client.acpSessionId,
): void {
  if (!acpSessionId) return;
  try {
    upsertRemoteAcpSessionRef({
      schemaVersion: 1,
      desktopSessionId: runtime.desktopSessionId,
      agentRef: runtime.agentRef,
      acpSessionId,
      lastSeq: runtime.client.lastSeq,
      connectionState: state,
      updatedAt: Date.now(),
    });
  } catch (err) {
    logRemoteExpertError(err, {
      operation_id: "persist",
      trace_id: runtime.client.traceId,
      stage: "SESSION",
      desktop_session_id: runtime.desktopSessionId,
    });
  }
}

function wireClient(runtime: Runtime): void {
  const { client } = runtime;
  client.on("session/update", (params: Record<string, unknown>) => {
    persistRef(runtime, "active");
    const events = mapAcpSessionUpdate({
      turnId: runtime.turnId,
      sessionId: runtime.desktopSessionId,
      params,
    });
    for (const event of events) {
      if (event.type === "assistant.delta") runtime.assistantText += event.text;
      if (event.type === "reasoning.delta") runtime.reasoningText += event.text;
      emitToRenderer({ ...event, sessionId: runtime.desktopSessionId });
    }
    for (const link of collectArtifactResourceLinks(params)) {
      try {
        const upserted = upsertRemoteExpertAcpArtifact({
          profileId: "default",
          sessionId: runtime.desktopSessionId,
          agentRef: runtime.agentRef,
          uri: link.uri,
          downloadPath: link.downloadPath,
          name: link.name,
        });
        emitToRenderer({
          type: "artifact.ready",
          turnId: runtime.turnId,
          sessionId: runtime.desktopSessionId,
          managedFileId: upserted.fileId,
          name: upserted.name,
          uri: upserted.uri,
        });
      } catch (err) {
        logRemoteExpertError(err, {
          operation_id: runtime.turnId || runtime.desktopSessionId,
          trace_id: runtime.client.traceId,
          stage: "ARTIFACT",
          desktop_session_id: runtime.desktopSessionId,
        });
      }
    }
  });
  client.on("session/request_permission", (payload: {
    id: unknown;
    params?: Record<string, unknown>;
  }) => {
    const requestId = String(payload.id ?? "");
    runtime.pendingPermission = {
      requestId,
      meta: (payload.params as { _meta?: unknown } | undefined)?._meta,
      authGeneration: runtime.authGeneration,
      resolved: false,
    };
    emitToRenderer({
      type: "permission.requested",
      turnId: runtime.turnId,
      sessionId: runtime.desktopSessionId,
      requestId,
      title: String(
        (payload.params as { toolCall?: { title?: string } } | undefined)?.toolCall
          ?.title ?? "permission",
      ),
      options: ["allow_once", "reject_once"],
    });
  });
  client.on("disconnected", () => {
    if (runtimes.get(runtime.desktopSessionId)?.client !== client) return;
    if (client.phase === "CLOSED") return;
    const stored = getRemoteAcpSessionRef(runtime.desktopSessionId);
    persistRef(runtime, "disconnected", stored?.acpSessionId);
    emitToRenderer({
      type: "connection",
      sessionId: runtime.desktopSessionId,
      state: "disconnected",
    });
  });
}

async function bootClient(input: {
  desktopSessionId: string;
  agentRef: string;
  authGeneration: string;
}): Promise<Runtime> {
  await ensureCompatibleContract();
  const expert = await fetchRemoteExpertByRef(input.agentRef);
  if (!isRemoteExpertCallable(expert)) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_UNAVAILABLE",
      "expert not callable",
    );
  }
  const existing = runtimes.get(input.desktopSessionId);
  const zombie =
    existing &&
    (existing.client.phase === "DISCONNECTED" ||
      existing.client.phase === "CLOSED" ||
      existing.client.phase === "IDLE");
  if (existing && existing.agentRef === input.agentRef && !zombie) {
    existing.authGeneration = input.authGeneration;
    return existing;
  }
  if (existing) {
    existing.client.disconnect();
    runtimes.delete(input.desktopSessionId);
  }
  await ensureFreshAccessToken();
  const transport = createAuthorizedBackendTransport();
  const client = new RemoteAcpClient({
    baseUrl: resolveBackendBaseUrl(),
    agentRef: input.agentRef,
    getAccessToken: () => transport.getAccessToken(),
    getOrgId: currentOrgId,
  });
  const runtime: Runtime = {
    client,
    authGeneration: input.authGeneration,
    orgId: currentOrgId(),
    agentRef: input.agentRef,
    desktopSessionId: input.desktopSessionId,
    assistantText: "",
    reasoningText: "",
    turnId: "",
  };
  wireClient(runtime);
  await client.connect();
  await client.initialize();
  runtimes.set(input.desktopSessionId, runtime);
  return runtime;
}

export async function submitRemoteExpertTurn(
  input: RemoteExpertTurnRequest,
): Promise<{ requestId: string; sessionId: string }> {
  sanitizeRemoteExpertDto(input);
  if (input.kind !== "remote-expert") {
    throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "kind invalid");
  }
  if (!UUID_RE.test(input.requestId)) {
    throw new RemoteExpertError("REMOTE_IPC_INVALID_INPUT", "requestId UUID");
  }
  emitRemoteExpertLog({
    operation_id: input.requestId,
    trace_id: input.requestId,
    stage: "PROMPT",
    status: "STARTED",
    agent_ref: input.agentRef,
    desktop_session_id: input.desktopSessionId,
    request_id: input.requestId,
  });
  const runtime = await bootClient({
    desktopSessionId: input.desktopSessionId,
    agentRef: input.agentRef,
    authGeneration: input.authGeneration,
  });
  if (runtime.client.isReconnecting) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
      "reconnect in progress",
      { retryable: true },
    );
  }
  runtime.turnId = input.requestId;
  runtime.assistantText = "";
  runtime.reasoningText = "";
  const catalog = await fetchRemoteExpertCatalog();
  const item = catalog.items.find((entry) => entry.agentRef === input.agentRef);
  if (!item || !isRemoteExpertCallable(item)) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_UNAVAILABLE",
      "expert not callable",
    );
  }
  if (item.capabilities.attachments !== "resource_link" && input.managedFileIds.length) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_RESOURCE_DENIED",
      "attachments not supported",
    );
  }
  const links = await prepareAttachmentResourceLinks({
    profileId: input.profileId ?? "default",
    fileIds: input.managedFileIds,
  });
  const blocks = buildPromptBlocks(input.promptText, links);
  if (!runtime.client.acpSessionId) {
    const stored = getRemoteAcpSessionRef(input.desktopSessionId);
    if (stored?.connectionState === "expired") {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_UNAVAILABLE",
        "session expired; start a new request",
      );
    }
    if (stored?.acpSessionId) {
      try {
        await runtime.client.sessionResume(stored.acpSessionId, stored.lastSeq);
      } catch (err) {
        if (isSessionLost(err)) {
          persistExpired(runtime, stored);
          throw new RemoteExpertError(
            "REMOTE_EXPERT_UNAVAILABLE",
            "session expired; start a new request",
          );
        }
        throw err;
      }
    } else {
      await runtime.client.sessionNew();
    }
    persistRef(runtime, "active");
  }
  const acpSessionId = runtime.client.acpSessionId!;
  try {
    materializeRemoteExpertTurn({
      sessionId: input.desktopSessionId,
      profileId: input.profileId ?? "default",
      turnId: input.requestId,
      userContent: input.promptText,
      assistantContent: "",
    });
  } catch (err) {
    logRemoteExpertError(err, {
      operation_id: input.requestId,
      trace_id: runtime.client.traceId,
      stage: "SESSION",
      desktop_session_id: input.desktopSessionId,
    });
  }
  const result = await runtime.client.sessionPrompt(
    acpSessionId,
    blocks,
    input.requestId,
  );
  try {
    materializeRemoteExpertTurn({
      sessionId: input.desktopSessionId,
      profileId: input.profileId ?? "default",
      turnId: input.requestId,
      userContent: input.promptText,
      assistantContent: runtime.assistantText,
      reasoningContent: runtime.reasoningText || undefined,
    });
  } catch (err) {
    logRemoteExpertError(err, {
      operation_id: input.requestId,
      trace_id: runtime.client.traceId,
      stage: "PROMPT",
      desktop_session_id: input.desktopSessionId,
    });
  }
  const outcome =
    result.stopReason === "cancelled"
      ? "cancelled"
      : result.stopReason === "end_turn"
        ? "completed"
        : "failed";
  emitToRenderer({
    type: "turn.end",
    turnId: input.requestId,
    sessionId: input.desktopSessionId,
    outcome,
    stopReason: result.stopReason,
  });
  emitRemoteExpertLog({
    operation_id: input.requestId,
    trace_id: runtime.client.traceId,
    stage: "PROMPT",
    status: "PASS",
    agent_ref: input.agentRef,
    desktop_session_id: input.desktopSessionId,
    acp_session_id: acpSessionId,
    request_id: input.requestId,
    last_seq: runtime.client.lastSeq,
  });
  return { requestId: input.requestId, sessionId: input.desktopSessionId };
}

export async function resumeRemoteExpertSession(input: {
  sessionId: string;
  authGeneration: string;
}): Promise<RemoteAcpSessionRef | null> {
  const stored = getRemoteAcpSessionRef(input.sessionId);
  if (!stored?.acpSessionId) {
    return null;
  }
  const runtime = await bootClient({
    desktopSessionId: input.sessionId,
    agentRef: stored.agentRef,
    authGeneration: input.authGeneration,
  });
  runtime.client.markReconnecting(true);
  try {
    await runtime.client.sessionResume(stored.acpSessionId, stored.lastSeq);
    persistRef(runtime, "active");
    return getRemoteAcpSessionRef(input.sessionId);
  } catch (err) {
    if (isSessionLost(err)) {
      persistExpired(runtime, stored);
      return getRemoteAcpSessionRef(input.sessionId);
    }
    persistRef(runtime, "disconnected");
    throw err;
  } finally {
    runtime.client.markReconnecting(false);
  }
}

export async function cancelRemoteExpertTurn(sessionId: string): Promise<void> {
  const runtime = runtimes.get(sessionId);
  if (!runtime?.client.acpSessionId) return;
  emitToRenderer({
    type: "lifecycle",
    sessionId,
    state: "cancelling",
  });
  await runtime.client.sessionCancel(runtime.client.acpSessionId);
}

export async function closeRemoteExpertSession(sessionId: string): Promise<void> {
  const runtime = runtimes.get(sessionId);
  if (runtime) {
    const acpSessionId = runtime.client.acpSessionId;
    if (acpSessionId) {
      persistRef(runtime, "closed");
      await runtime.client.sessionClose(acpSessionId);
    }
    runtimes.delete(sessionId);
  }
}

export function decideRemoteExpertPermission(input: {
  sessionId: string;
  requestId: string;
  optionId: RemoteExpertPermissionOption;
  authGeneration: string;
}): void {
  const runtime = runtimes.get(input.sessionId);
  const pending = runtime?.pendingPermission;
  if (!pending || pending.requestId !== input.requestId) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_PERMISSION_STALE",
      "stale permission",
    );
  }
  if (pending.authGeneration !== input.authGeneration) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_AUTH_GENERATION_CHANGED",
      "auth generation changed",
    );
  }
  if (pending.resolved) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_PERMISSION_STALE",
      "already decided",
    );
  }
  pending.resolved = true;
  runtime.client.respondPermission(
    pending.requestId,
    input.optionId,
    pending.meta,
  );
  emitToRenderer({
    type: "permission.resolved",
    turnId: runtime.turnId,
    sessionId: input.sessionId,
    requestId: input.requestId,
    optionId: input.optionId,
  });
}

export function disposeRemoteExpertSubsystem(): void {
  for (const runtime of runtimes.values()) {
    runtime.client.disconnect();
  }
  runtimes.clear();
}

function isSessionLost(err: unknown): boolean {
  if (!(err instanceof RemoteExpertError)) return false;
  return (
    err.code === "REMOTE_EXPERT_SESSION_LOST" ||
    /session not found/i.test(err.message)
  );
}

function persistExpired(
  runtime: Runtime,
  stored: RemoteAcpSessionRef,
): void {
  try {
    upsertRemoteAcpSessionRef({
      ...stored,
      lastSeq: Math.max(stored.lastSeq, runtime.client.lastSeq),
      connectionState: "expired",
      updatedAt: Date.now(),
    });
  } catch (persistErr) {
    logRemoteExpertError(persistErr, {
      operation_id: "persist",
      trace_id: runtime.client.traceId,
      stage: "SESSION",
      desktop_session_id: runtime.desktopSessionId,
    });
  }
  emitToRenderer({
    type: "connection",
    sessionId: runtime.desktopSessionId,
    state: "expired",
  });
}

export function invalidateRemoteExpertAuth(reason: "auth" | "org"): void {
  const code =
    reason === "org"
      ? "REMOTE_EXPERT_ORG_CHANGED"
      : "REMOTE_EXPERT_AUTH_GENERATION_CHANGED";
  for (const runtime of runtimes.values()) {
    if (runtime.pendingPermission) {
      runtime.pendingPermission.resolved = true;
    }
    runtime.client.disconnect();
    emitToRenderer({
      type: "lifecycle",
      sessionId: runtime.desktopSessionId,
      state: "disconnected",
      message: code,
    });
  }
  runtimes.clear();
}

