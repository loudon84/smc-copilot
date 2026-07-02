/**
 * Expert Gateway v6.2 task SSE proxy (v7.5).
 * Main Process subscribes to eventSseUrl with Bearer token and pushes normalized events to Renderer.
 */
import type { WebContents } from "electron";
import { app } from "electron";
import { getDeviceIdentity } from "../genehub/device-identity";
import { getMcpAccessToken } from "../mcp-skill-gateway-runtime/mcp-token-provider";
import type {
  ExpertTaskEvent,
  ExpertTaskStreamClosedEvent,
  ExpertTaskStreamError,
  SubscribeExpertTaskEventsInput,
  SubscribeExpertTaskEventsResult,
} from "../../shared/hermes-experts/expert-task-stream-contract";
import { assertNoHermesRunEventStream } from "../../shared/hermes-experts/expert-task-stream-guards";
import { cacheTaskArtifact } from "./expert-artifact-client";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [2000, 4000, 8000];

type ActiveSubscription = {
  taskId: string;
  webContents: WebContents;
  abortController: AbortController;
  reconnectAttempt: number;
  closed: boolean;
};

const activeSubscriptions = new Map<string, ActiveSubscription>();

function nowIso(): string {
  return new Date().toISOString();
}

function clientVersionHeader(): string {
  return `copilot-desktop/${app.getVersion()}`;
}

function buildAuthHeaders(): Record<string, string> {
  const token = getMcpAccessToken();
  if (!token) {
    throw new Error("Desktop login required");
  }
  const device = getDeviceIdentity();
  return {
    Accept: "text/event-stream",
    Authorization: `Bearer ${token}`,
    "X-NoDeskClaw-Desktop-Device-Id": device.deviceFingerprint,
    "X-NoDeskClaw-Client": "copilot-desktop",
    "X-Client-Version": clientVersionHeader(),
  };
}

function sendTaskEvent(webContents: WebContents, event: ExpertTaskEvent): void {
  if (webContents.isDestroyed()) return;
  if (event.type === "task.artifact.ready") {
    cacheTaskArtifact(event.taskId, {
      artifactId: event.artifactId ?? event.artifactUrl ?? `artifact-${event.createdAt}`,
      taskId: event.taskId,
      name: event.name ?? event.artifactId ?? "Artifact",
      mimeType: event.mimeType,
      artifactUrl: event.artifactUrl,
    });
  }
  webContents.send("hermes-experts:task-event", event);
}

function sendStreamError(webContents: WebContents, error: ExpertTaskStreamError): void {
  if (webContents.isDestroyed()) return;
  webContents.send("hermes-experts:task-stream-error", error);
}

function sendStreamClosed(webContents: WebContents, event: ExpertTaskStreamClosedEvent): void {
  if (webContents.isDestroyed()) return;
  webContents.send("hermes-experts:task-stream-closed", event);
}

function normalizeRawEvent(taskId: string, raw: Record<string, unknown>): ExpertTaskEvent {
  const type = String(raw.type ?? raw.event ?? raw.eventType ?? "");
  const createdAt = String(raw.createdAt ?? raw.created_at ?? nowIso());

  switch (type) {
    case "task.started":
      return {
        type: "task.started",
        taskId,
        taskNo: raw.taskNo != null ? String(raw.taskNo) : raw.task_no != null ? String(raw.task_no) : undefined,
        message: raw.message != null ? String(raw.message) : undefined,
        createdAt,
      };
    case "task.progress":
      return {
        type: "task.progress",
        taskId,
        stage: raw.stage != null ? String(raw.stage) : undefined,
        message: String(raw.message ?? raw.summary ?? "Task in progress"),
        progress: typeof raw.progress === "number" ? raw.progress : undefined,
        createdAt,
      };
    case "task.artifact.ready":
      return {
        type: "task.artifact.ready",
        taskId,
        artifactId:
          raw.artifactId != null
            ? String(raw.artifactId)
            : raw.artifact_id != null
              ? String(raw.artifact_id)
              : undefined,
        artifactUrl:
          raw.artifactUrl != null
            ? String(raw.artifactUrl)
            : raw.artifact_url != null
              ? String(raw.artifact_url)
              : undefined,
        name: raw.name != null ? String(raw.name) : undefined,
        mimeType:
          raw.mimeType != null
            ? String(raw.mimeType)
            : raw.mime_type != null
              ? String(raw.mime_type)
              : undefined,
        createdAt,
      };
    case "task.completed":
      return {
        type: "task.completed",
        taskId,
        message: raw.message != null ? String(raw.message) : undefined,
        resultText:
          raw.resultText != null
            ? String(raw.resultText)
            : raw.result_text != null
              ? String(raw.result_text)
              : undefined,
        createdAt,
      };
    case "task.failed":
      return {
        type: "task.failed",
        taskId,
        error: String(raw.error ?? raw.message ?? "Task failed"),
        errorCode: raw.errorCode != null ? String(raw.errorCode) : raw.error_code != null ? String(raw.error_code) : undefined,
        createdAt,
      };
    default: {
      const summary =
        raw.message != null
          ? String(raw.message)
          : raw.summary != null
            ? String(raw.summary)
            : type || "Task update";
      return {
        type: "task.progress",
        taskId,
        message: summary,
        createdAt,
      };
    }
  }
}

function parseSseBlock(taskId: string, block: string): ExpertTaskEvent | null {
  let eventType = "";
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataLine = line.slice(6);
    }
  }
  if (!dataLine || dataLine === "[DONE]") return null;
  try {
    const parsed = JSON.parse(dataLine) as Record<string, unknown>;
    if (eventType && !parsed.type) {
      parsed.type = eventType;
    }
    return normalizeRawEvent(taskId, parsed);
  } catch {
    return {
      type: "task.progress",
      taskId,
      message: dataLine,
      createdAt: nowIso(),
    };
  }
}

async function consumeSseStream(sub: ActiveSubscription, eventSseUrl: string): Promise<void> {
  const headers = buildAuthHeaders();
  const res = await fetch(eventSseUrl, {
    method: "GET",
    headers,
    signal: sub.abortController.signal,
  });

  if (!res.ok) {
    throw new Error(`SSE HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error("SSE response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!sub.closed) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const event = parseSseBlock(sub.taskId, part);
      if (!event) continue;
      sendTaskEvent(sub.webContents, event);
      if (event.type === "task.completed" || event.type === "task.failed") {
        sub.closed = true;
        sendStreamClosed(sub.webContents, {
          type: "task.stream.closed",
          taskId: sub.taskId,
          reason: event.type,
          createdAt: nowIso(),
        });
        return;
      }
    }
  }
}

function scheduleReconnect(sub: ActiveSubscription, input: SubscribeExpertTaskEventsInput): void {
  if (sub.closed || sub.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    sendStreamError(sub.webContents, {
      taskId: sub.taskId,
      error: "Task stream connection failed",
      errorCode: "TASK_STREAM_CONNECT_FAILED",
    });
    sendStreamClosed(sub.webContents, {
      type: "task.stream.closed",
      taskId: sub.taskId,
      reason: "connect_failed",
      createdAt: nowIso(),
    });
    activeSubscriptions.delete(sub.taskId);
    return;
  }

  const delay = RECONNECT_DELAYS_MS[sub.reconnectAttempt] ?? 8000;
  sub.reconnectAttempt += 1;

  setTimeout(() => {
    if (sub.closed || sub.webContents.isDestroyed()) {
      activeSubscriptions.delete(sub.taskId);
      return;
    }
    void runSubscription(sub, input).catch(() => {
      scheduleReconnect(sub, input);
    });
  }, delay);
}

async function runSubscription(
  sub: ActiveSubscription,
  input: SubscribeExpertTaskEventsInput,
): Promise<void> {
  try {
    await consumeSseStream(sub, input.eventSseUrl);
    if (!sub.closed) {
      sendStreamClosed(sub.webContents, {
        type: "task.stream.closed",
        taskId: sub.taskId,
        reason: "eof",
        createdAt: nowIso(),
      });
    }
  } finally {
    activeSubscriptions.delete(sub.taskId);
  }
}

export function subscribeExpertTaskEvents(
  input: SubscribeExpertTaskEventsInput,
  webContents: WebContents,
): SubscribeExpertTaskEventsResult {
  assertNoHermesRunEventStream(input.eventSseUrl);
  unsubscribeExpertTaskEvents(input.taskId);

  const sub: ActiveSubscription = {
    taskId: input.taskId,
    webContents,
    abortController: new AbortController(),
    reconnectAttempt: 0,
    closed: false,
  };
  activeSubscriptions.set(input.taskId, sub);

  void runSubscription(sub, input).catch(() => {
    scheduleReconnect(sub, input);
  });

  return { ok: true, taskId: input.taskId };
}

export function unsubscribeExpertTaskEvents(taskId: string): void {
  const sub = activeSubscriptions.get(taskId);
  if (!sub) return;
  sub.closed = true;
  sub.abortController.abort();
  activeSubscriptions.delete(taskId);
}

export function shutdownExpertTaskStreams(): void {
  for (const taskId of [...activeSubscriptions.keys()]) {
    unsubscribeExpertTaskEvents(taskId);
  }
}
