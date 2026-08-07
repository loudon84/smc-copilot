/**
 * Workspace Chat stream — Durable Chat Runtime v2 (chat-runs), not instance completions.
 * clientRunId = stable Desktop session id (payload.session_id).
 */
import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type {
  WorkspaceChatChunkEvent,
  WorkspaceChatDoneEvent,
  WorkspaceChatErrorEvent,
  WorkspaceChatSendPayload,
  WorkspaceChatStreamScope,
  WorkspaceChatToolProgressEvent,
  WorkspaceChatUsageEvent,
} from "../../shared/workspace-chat/workspace-chat-contract";
import type { ServeChatEvent } from "../../shared/copilot-runtime/chat-runtime-serve-contract";
import { chatRuntimeClient } from "../copilot-runtime-client/clients/chat-runtime-client";
import { getRuntimeConnectionState } from "../copilot-runtime-client/runtime-connection-manager";
import {
  assertReadyForChat,
  getCachedCapabilities,
  hasFeature,
} from "../copilot-runtime-client/runtime-capability-manager";
import { resolveInstanceId } from "./workspace-chat-client";

type ActiveStream = {
  abort: () => void;
  streamId: string;
  runId: string;
};

const activeStreams = new Map<string, ActiveStream>();

function streamKey(profileId: string, sessionId: string): string {
  return `${profileId}:${sessionId}`;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function extractUserMessage(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === "user" && msg.content.trim()) {
      return msg.content;
    }
  }
  const last = messages[messages.length - 1];
  return last?.content?.trim() || "";
}

function assertWorkspaceChatCapability(): void {
  const ready = getRuntimeConnectionState().ready;
  const gate = assertReadyForChat(ready);
  if (gate) {
    throw Object.assign(new Error(gate.message), { runtimeError: gate });
  }
  // Prefer finer gate when Runtime advertises subdivided chat.runtime.v2.* features.
  const caps = getCachedCapabilities();
  if (
    caps &&
    caps.featureIds.some(
      (id) => id.startsWith("chat.runtime.v2.") && id !== "chat.runtime.v2",
    ) &&
    !hasFeature("chat.runtime.v2.real-execution")
  ) {
    throw new Error("Runtime missing required chat feature: chat.runtime.v2.real-execution");
  }
}

function scopeFrom(
  payload: WorkspaceChatSendPayload,
  streamId: string,
): WorkspaceChatStreamScope {
  return {
    stream_id: streamId,
    profile_id: payload.profile_id,
    workspace_id: payload.workspace_id,
    session_id: payload.session_id,
  };
}

/** Map Serve durable events → legacy workspace-chat IPC (Renderer contract unchanged). */
function forwardServeEvent(
  win: BrowserWindow,
  scope: WorkspaceChatStreamScope,
  event: ServeChatEvent,
): boolean {
  const payload = event.payload;

  switch (event.type) {
    case "agent.message.delta": {
      const content =
        pickString(payload, "content", "text", "delta", "message") ?? "";
      if (content) {
        win.webContents.send("workspace-chat:chunk", {
          ...scope,
          content,
        } satisfies WorkspaceChatChunkEvent);
      }
      return false;
    }
    case "tool.progress":
    case "tool.started": {
      const name =
        pickString(payload, "name", "tool", "toolName", "tool_name") ?? "tool";
      win.webContents.send("workspace-chat:tool-progress", {
        ...scope,
        name,
        label: pickString(payload, "label") ?? null,
      } satisfies WorkspaceChatToolProgressEvent);
      return false;
    }
    case "usage.updated": {
      win.webContents.send("workspace-chat:usage", {
        ...scope,
        prompt_tokens: pickNumber(payload, "promptTokens", "prompt_tokens") ?? 0,
        completion_tokens:
          pickNumber(payload, "completionTokens", "completion_tokens") ?? 0,
        total_tokens: pickNumber(payload, "totalTokens", "total_tokens") ?? 0,
      } satisfies WorkspaceChatUsageEvent);
      return false;
    }
    case "turn.completed": {
      win.webContents.send("workspace-chat:done", {
        ...scope,
        resolved_session_id:
          event.sessionId ||
          pickString(payload, "sessionId", "session_id") ||
          scope.session_id,
      } satisfies WorkspaceChatDoneEvent);
      return true;
    }
    case "turn.failed":
    case "turn.cancelled": {
      win.webContents.send("workspace-chat:error", {
        ...scope,
        message:
          pickString(payload, "message", "error", "detail") ??
          (event.type === "turn.cancelled" ? "Turn cancelled" : "Turn failed"),
      } satisfies WorkspaceChatErrorEvent);
      return true;
    }
    default:
      return false;
  }
}

function emitStreamError(
  win: BrowserWindow,
  scope: WorkspaceChatStreamScope,
  message: string,
): void {
  if (win.isDestroyed()) return;
  win.webContents.send("workspace-chat:error", {
    ...scope,
    message,
  } satisfies WorkspaceChatErrorEvent);
}

export async function startWorkspaceChatStream(
  win: BrowserWindow,
  payload: WorkspaceChatSendPayload,
): Promise<{ stream_id: string }> {
  const key = streamKey(payload.profile_id, payload.session_id);
  const existing = activeStreams.get(key);
  if (existing) {
    existing.abort();
    activeStreams.delete(key);
  }

  const streamId = payload.stream_id ?? `stream_${randomUUID()}`;
  const scope = scopeFrom(payload, streamId);
  // Stable Desktop session id — one ChatRun per session, not per message.
  const clientRunId = payload.session_id.trim() || `session_${randomUUID()}`;

  try {
    assertWorkspaceChatCapability();
  } catch (err) {
    emitStreamError(win, scope, err instanceof Error ? err.message : String(err));
    return { stream_id: streamId };
  }

  const message = extractUserMessage(payload.messages);
  if (!message && !(payload.attachments && payload.attachments.length > 0)) {
    emitStreamError(win, scope, "Empty message");
    return { stream_id: streamId };
  }

  let instanceId: string;
  try {
    instanceId = await resolveInstanceId(payload.profile_id);
  } catch (err) {
    emitStreamError(win, scope, err instanceof Error ? err.message : String(err));
    return { stream_id: streamId };
  }

  const controller = new AbortController();
  let serverRunId = clientRunId;
  let turnTerminal = false;

  const abortFn = () => {
    controller.abort();
    void chatRuntimeClient.abort(serverRunId).catch(() => undefined);
  };

  activeStreams.set(key, { abort: abortFn, streamId, runId: clientRunId });

  try {
    const accepted = await chatRuntimeClient.startTurn({
      clientRunId,
      clientTurnId: streamId,
      instanceId,
      sessionId: payload.session_id,
      workspaceId: payload.workspace_id,
      message: message || "(attachments)",
      modelId: payload.model ?? undefined,
      attachmentIds: payload.attachments ?? [],
    });

    serverRunId = accepted.runId || clientRunId;
    activeStreams.set(key, { abort: abortFn, streamId, runId: serverRunId });

    await chatRuntimeClient.subscribeEvents({
      runId: serverRunId,
      lastEventId: accepted.eventCursor > 0 ? String(accepted.eventCursor) : null,
      signal: controller.signal,
      autoReconnect: true,
      onEvent: (serveEvent) => {
        if (win.isDestroyed()) {
          abortFn();
          return;
        }
        if (turnTerminal) return;
        const terminal = forwardServeEvent(win, scope, {
          ...serveEvent,
          turnId: serveEvent.turnId || streamId,
          runId: serveEvent.runId || serverRunId,
        });
        if (terminal) {
          turnTerminal = true;
          activeStreams.delete(key);
          controller.abort();
        }
      },
      onError: (err) => {
        if (turnTerminal || controller.signal.aborted) return;
        emitStreamError(
          win,
          scope,
          err instanceof Error ? err.message : String(err),
        );
      },
    });
  } catch (err) {
    if (!controller.signal.aborted) {
      emitStreamError(win, scope, err instanceof Error ? err.message : String(err));
    }
  } finally {
    activeStreams.delete(key);
  }

  return { stream_id: streamId };
}

export function abortWorkspaceChatStream(profileId: string, sessionId?: string): void {
  if (sessionId) {
    const key = streamKey(profileId, sessionId);
    const entry = activeStreams.get(key);
    if (entry) {
      entry.abort();
      activeStreams.delete(key);
    }
    return;
  }

  const prefix = `${profileId}:`;
  for (const [key, entry] of activeStreams) {
    if (key.startsWith(prefix)) {
      entry.abort();
      activeStreams.delete(key);
    }
  }
}
