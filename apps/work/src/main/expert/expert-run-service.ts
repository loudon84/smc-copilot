/**
 * Unique Expert task lifecycle owner for apps/work.
 * SSE reconnect + bounded status-poll fallback + cancel/retry.
 * HermesTask remains authoritative truth; this service only orchestrates.
 */

import { parseRunSseBlock } from "../run-stream";
import type {
  ExpertLocalPhase,
  ExpertRequest,
  ExpertRunProjection,
  ExpertTaskEvent,
  HermesTaskResult,
  HermesTaskSnapshot,
  HermesTaskStatus,
} from "../../shared/expert";
import {
  createClientRequestId,
  isExpertTerminalPhase,
} from "../../shared/expert";
import {
  createExpertGatewayClient,
  ExpertGatewayError,
  type ExpertGatewayClient,
} from "./expert-gateway-client";

const SSE_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
const POLL_INTERVAL_MS = 15_000;
const POLL_MAX_MS = 10 * 60_000;

export type ExpertProjectionListener = (projection: ExpertRunProjection) => void;

export interface ExpertRunService {
  start(request: ExpertRequest): Promise<ExpertRunProjection>;
  cancel(clientRequestId: string, taskId?: string | null): Promise<ExpertRunProjection | null>;
  retry(
    previousClientRequestId: string,
    request: ExpertRequest,
  ): Promise<ExpertRunProjection>;
  getProjection(clientRequestId: string): ExpertRunProjection | null;
  listProjections(sessionId: string): ExpertRunProjection[];
  rehydrate(input: {
    request: ExpertRequest;
    taskId: string;
    lastEventId: string | null;
    phase: ExpertLocalPhase;
  }): Promise<ExpertRunProjection>;
  onProjectionChanged(listener: ExpertProjectionListener): () => void;
  /** Idempotent dispose: stop new requests → abort SSE/polling → clear cache. */
  dispose(): void;
  acceptingRequests(): boolean;
}

interface ActiveRun {
  request: ExpertRequest;
  projection: ExpertRunProjection;
  abort: AbortController;
  seenEventIds: Set<string>;
  highestEventSeq: number;
  terminalConfirmed: boolean;
  reconnectAttempts: number;
  pollStartedAt: number | null;
  pollTimer: ReturnType<typeof setTimeout> | null;
  accepted: {
    event_stream: string;
    event_token_url: string;
    result_url: string;
    artifact_url: string;
  } | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mapRemoteStatusToPhase(status: HermesTaskStatus): ExpertLocalPhase {
  switch (status) {
    case "queued":
      return "starting";
    case "running":
      return "running";
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "running";
  }
}

function displayStageForPhase(phase: ExpertLocalPhase): string | null {
  switch (phase) {
    case "queued":
    case "starting":
      return "preparing";
    case "running":
      return "running";
    case "succeeded":
    case "failed":
    case "cancelled":
    case "expired":
    case "unauthorized":
      return "finalizing";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function createProjection(request: ExpertRequest): ExpertRunProjection {
  return {
    clientRequestId: request.clientRequestId,
    taskId: null,
    phase: "queued",
    displayStage: "preparing",
    expertSlug: request.expertSlug,
    skillName: request.skillName,
    prompt: request.prompt,
    sessionId: request.sessionId,
    profileId: request.profileId,
    lastEventId: null,
    lastEventSeq: null,
    errorCode: null,
    errorMessage: null,
    resultSummary: null,
    resultContent: null,
    artifactIds: [],
    updatedAt: nowIso(),
  };
}

function parseTaskEvent(data: string): ExpertTaskEvent | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed)) return null;
    if (typeof parsed.task_id !== "string") return null;
    if (typeof parsed.event_type !== "string" && typeof parsed.event !== "string") {
      return null;
    }
    return parsed as ExpertTaskEvent;
  } catch {
    return null;
  }
}

export function createExpertRunService(
  options: {
    gateway?: ExpertGatewayClient;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  } = {},
): ExpertRunService {
  const gateway = options.gateway ?? createExpertGatewayClient();
  const sleep =
    options.sleep ??
    ((ms, signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const timer = setTimeout(() => resolve(), ms);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }));

  const runs = new Map<string, ActiveRun>();
  const listeners = new Set<ExpertProjectionListener>();
  let accepting = true;
  let disposed = false;

  function emit(projection: ExpertRunProjection): void {
    for (const listener of listeners) {
      try {
        listener(projection);
      } catch (err) {
        console.warn("[expert-run] listener error", err);
      }
    }
  }

  function updateProjection(
    run: ActiveRun,
    patch: Partial<ExpertRunProjection>,
  ): ExpertRunProjection {
    if (
      run.terminalConfirmed &&
      patch.phase &&
      !isExpertTerminalPhase(patch.phase)
    ) {
      return run.projection;
    }
    const next: ExpertRunProjection = {
      ...run.projection,
      ...patch,
      displayStage:
        patch.displayStage ??
        (patch.phase
          ? displayStageForPhase(patch.phase)
          : run.projection.displayStage),
      updatedAt: nowIso(),
    };
    run.projection = next;
    if (next.phase && isExpertTerminalPhase(next.phase)) {
      run.terminalConfirmed = true;
    }
    emit(next);
    return next;
  }

  function assertAccepting(): void {
    if (!accepting || disposed) {
      throw new ExpertGatewayError("Expert run service is not accepting requests", {
        status: 503,
        errorCode: "DISPOSED",
      });
    }
  }

  async function confirmTerminal(
    run: ActiveRun,
    preferred?: HermesTaskResult | null,
  ): Promise<void> {
    if (run.terminalConfirmed) return;
    const taskId = run.projection.taskId;
    if (!taskId) return;
    try {
      const result = preferred ?? (await gateway.getResult(taskId));
      const phase = mapRemoteStatusToPhase(result.status ?? "completed");
      updateProjection(run, {
        phase: result.ready && phase === "running" ? "succeeded" : phase,
        resultSummary: result.result_summary ?? result.summary ?? null,
        resultContent: result.result_content ?? result.content ?? null,
        displayStage: "finalizing",
      });
      try {
        const artifacts = await gateway.listArtifacts(taskId);
        updateProjection(run, {
          artifactIds: artifacts.map((a) => a.id),
        });
      } catch {
        /* artifact list is best-effort after completion */
      }
    } catch (err) {
      if (err instanceof ExpertGatewayError && err.status === 403) {
        updateProjection(run, {
          phase: "unauthorized",
          errorCode: err.errorCode,
          errorMessage: err.message,
        });
        return;
      }
      throw err;
    }
  }

  function applyEvent(run: ActiveRun, event: ExpertTaskEvent, eventId: string | undefined): void {
    if (run.terminalConfirmed) return;
    const seq =
      typeof event.event_seq === "number" ? event.event_seq : Number.NaN;
    if (eventId && run.seenEventIds.has(eventId)) return;
    if (eventId) run.seenEventIds.add(eventId);
    if (!Number.isNaN(seq)) {
      if (seq < run.highestEventSeq) return;
      run.highestEventSeq = Math.max(run.highestEventSeq, seq);
    }

    const eventName = event.event || event.event_type;
    const patch: Partial<ExpertRunProjection> = {
      lastEventId: eventId ?? run.projection.lastEventId,
      lastEventSeq: Number.isNaN(seq) ? run.projection.lastEventSeq : seq,
    };

    if (eventName === "task.started" || eventName === "started") {
      patch.phase = "running";
      patch.displayStage = "running";
    } else if (eventName === "task.progress" || eventName === "progress") {
      patch.phase = "running";
      // runtimeProgress=false: only minimum stages, ignore fine-grained tool progress.
      const stage =
        "stage" in event && typeof event.stage === "string" ? event.stage : null;
      if (stage === "preparing" || stage === "finalizing") {
        patch.displayStage = stage;
      } else {
        patch.displayStage = "running";
      }
    } else if (eventName === "task.completed" || eventName === "completed") {
      patch.phase = "succeeded";
      patch.displayStage = "finalizing";
      if ("result" in event && isRecord(event.result)) {
        patch.resultSummary =
          typeof event.result.summary === "string" ? event.result.summary : null;
        patch.resultContent =
          typeof event.result.content === "string" ? event.result.content : null;
      }
    } else if (eventName === "task.failed" || eventName === "failed") {
      patch.phase = "failed";
      patch.displayStage = "finalizing";
      patch.errorMessage =
        "message" in event && typeof event.message === "string"
          ? event.message
          : "Task failed";
    } else if (eventName === "task.artifact_ready" || eventName === "artifact_ready") {
      const artifactId =
        "artifact_id" in event && typeof event.artifact_id === "string"
          ? event.artifact_id
          : null;
      if (artifactId && !run.projection.artifactIds.includes(artifactId)) {
        patch.artifactIds = [...run.projection.artifactIds, artifactId];
      }
    }

    updateProjection(run, patch);
    if (patch.phase && isExpertTerminalPhase(patch.phase)) {
      void confirmTerminal(run).catch((err) => {
        console.warn("[expert-run] confirmTerminal failed", err);
      });
    }
  }

  async function pollStatus(run: ActiveRun): Promise<void> {
    if (run.terminalConfirmed || run.abort.signal.aborted) return;
    if (run.pollStartedAt == null) run.pollStartedAt = Date.now();
    const elapsed = Date.now() - run.pollStartedAt;
    if (elapsed > POLL_MAX_MS) {
      updateProjection(run, {
        phase: "failed",
        errorCode: "delivery-timeout",
        errorMessage: "Event delivery timed out after reconnect and polling budget",
      });
      return;
    }
    const taskId = run.projection.taskId;
    if (!taskId) return;
    try {
      const snapshot = await gateway.getSnapshot(taskId);
      applySnapshot(run, snapshot);
      if (run.terminalConfirmed) return;
    } catch (err) {
      if (err instanceof ExpertGatewayError && err.status === 403) {
        updateProjection(run, {
          phase: "unauthorized",
          errorCode: err.errorCode,
          errorMessage: err.message,
        });
        return;
      }
    }
    run.pollTimer = setTimeout(() => {
      void pollStatus(run);
    }, POLL_INTERVAL_MS);
  }

  function applySnapshot(run: ActiveRun, snapshot: HermesTaskSnapshot): void {
    const status = snapshot.status;
    const phase = mapRemoteStatusToPhase(status);
    if (isExpertTerminalPhase(phase)) {
      updateProjection(run, {
        phase,
        displayStage: "finalizing",
        resultSummary: snapshot.result?.summary ?? null,
        resultContent:
          snapshot.result?.result_content ?? snapshot.result?.content ?? null,
      });
      void confirmTerminal(run).catch(() => undefined);
      return;
    }
    updateProjection(run, {
      phase,
      displayStage: displayStageForPhase(phase),
    });
  }

  async function consumeSse(run: ActiveRun): Promise<void> {
    const taskId = run.projection.taskId;
    if (!taskId || run.terminalConfirmed) return;

    while (!run.abort.signal.aborted && !run.terminalConfirmed) {
      try {
        const headers: Record<string, string> = {
          Accept: "text/event-stream",
        };
        if (run.projection.lastEventId) {
          headers["Last-Event-ID"] = run.projection.lastEventId;
        }
        const path = gateway.buildEventsPath(taskId);
        const res = await gateway.openAuthorizedGet(path, {
          headers,
          signal: run.abort.signal,
        });
        if (!res.ok || !res.body) {
          throw new ExpertGatewayError(`SSE failed: ${res.status}`, {
            status: res.status,
          });
        }
        run.reconnectAttempts = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!run.abort.signal.aborted && !run.terminalConfirmed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const parsed = parseRunSseBlock(part);
            if (!parsed) continue;
            const event = parseTaskEvent(parsed.data);
            if (!event) continue;
            applyEvent(run, event, parsed.id);
          }
        }
        if (run.terminalConfirmed || run.abort.signal.aborted) return;
      } catch (err) {
        if (run.abort.signal.aborted || run.terminalConfirmed) return;
        if (err instanceof ExpertGatewayError && err.status === 403) {
          updateProjection(run, {
            phase: "unauthorized",
            errorCode: err.errorCode,
            errorMessage: err.message,
          });
          return;
        }
      }

      if (run.reconnectAttempts >= SSE_RECONNECT_DELAYS_MS.length) {
        void pollStatus(run);
        return;
      }
      const delay = SSE_RECONNECT_DELAYS_MS[run.reconnectAttempts] ?? 16_000;
      run.reconnectAttempts += 1;
      try {
        await sleep(delay, run.abort.signal);
      } catch {
        return;
      }
    }
  }

  async function beginAccepted(run: ActiveRun): Promise<void> {
    updateProjection(run, { phase: "starting", displayStage: "preparing" });
    try {
      const accepted = await gateway.callSkill({
        expertSlug: run.request.expertSlug,
        skillName: run.request.skillName,
        prompt: run.request.prompt,
        idempotencyKey: run.request.clientRequestId,
      });
      run.accepted = {
        event_stream: accepted.event_stream,
        event_token_url: accepted.event_token_url,
        result_url: accepted.result_url,
        artifact_url: accepted.artifact_url,
      };
      updateProjection(run, {
        taskId: accepted.task_id,
        phase: "running",
        displayStage: "running",
      });
      void consumeSse(run);
    } catch (err) {
      if (err instanceof ExpertGatewayError) {
        const unauthorized =
          err.status === 401 ||
          err.status === 403 ||
          err.errorCode === "EXPERT_PERMISSION_DENIED" ||
          err.errorCode === "UNAUTHORIZED";
        updateProjection(run, {
          phase: unauthorized ? "unauthorized" : "failed",
          errorCode: err.errorCode,
          errorMessage: err.message,
        });
        return;
      }
      updateProjection(run, {
        phase: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const service: ExpertRunService = {
    async start(request: ExpertRequest): Promise<ExpertRunProjection> {
      assertAccepting();
      if (runs.has(request.clientRequestId)) {
        return runs.get(request.clientRequestId)!.projection;
      }
      const run: ActiveRun = {
        request,
        projection: createProjection(request),
        abort: new AbortController(),
        seenEventIds: new Set(),
        highestEventSeq: -1,
        terminalConfirmed: false,
        reconnectAttempts: 0,
        pollStartedAt: null,
        pollTimer: null,
        accepted: null,
      };
      runs.set(request.clientRequestId, run);
      emit(run.projection);
      void beginAccepted(run);
      return run.projection;
    },

    async cancel(
      clientRequestId: string,
      taskId?: string | null,
    ): Promise<ExpertRunProjection | null> {
      const run = runs.get(clientRequestId);
      if (!run) return null;
      if (run.projection.phase === "queued") {
        run.abort.abort();
        return updateProjection(run, {
          phase: "cancelled",
          displayStage: "finalizing",
        });
      }
      if (isExpertTerminalPhase(run.projection.phase)) {
        return run.projection;
      }
      const id = taskId ?? run.projection.taskId;
      run.abort.abort();
      if (run.pollTimer) {
        clearTimeout(run.pollTimer);
        run.pollTimer = null;
      }
      if (id) {
        try {
          await gateway.cancelTask(id);
        } catch (err) {
          if (err instanceof ExpertGatewayError && err.status === 403) {
            return updateProjection(run, {
              phase: "unauthorized",
              errorCode: err.errorCode,
              errorMessage: err.message,
            });
          }
          /* cancel is best-effort for local UI; still mark cancelled */
        }
      }
      return updateProjection(run, {
        phase: "cancelled",
        displayStage: "finalizing",
      });
    },

    async retry(
      previousClientRequestId: string,
      request: ExpertRequest,
    ): Promise<ExpertRunProjection> {
      assertAccepting();
      const previous = runs.get(previousClientRequestId);
      if (!previous || !isExpertTerminalPhase(previous.projection.phase)) {
        throw new ExpertGatewayError("Retry only allowed for terminal failures", {
          status: 400,
          errorCode: "RETRY_NOT_ALLOWED",
        });
      }
      if (
        previous.projection.phase !== "failed" &&
        previous.projection.phase !== "expired" &&
        previous.projection.errorCode !== "delivery-timeout"
      ) {
        throw new ExpertGatewayError("Retry only allowed for terminal failures", {
          status: 400,
          errorCode: "RETRY_NOT_ALLOWED",
        });
      }
      if (request.clientRequestId === previousClientRequestId) {
        throw new ExpertGatewayError("Retry must use a new clientRequestId", {
          status: 400,
          errorCode: "RETRY_ID_REUSED",
        });
      }
      return service.start(request);
    },

    getProjection(clientRequestId: string): ExpertRunProjection | null {
      return runs.get(clientRequestId)?.projection ?? null;
    },

    listProjections(sessionId: string): ExpertRunProjection[] {
      return Array.from(runs.values())
        .filter((run) => run.request.sessionId === sessionId)
        .map((run) => run.projection);
    },

    async rehydrate(input): Promise<ExpertRunProjection> {
      assertAccepting();
      const existing = runs.get(input.request.clientRequestId);
      if (existing) return existing.projection;

      const run: ActiveRun = {
        request: input.request,
        projection: {
          ...createProjection(input.request),
          taskId: input.taskId,
          phase: input.phase,
          displayStage: displayStageForPhase(input.phase),
          lastEventId: input.lastEventId,
        },
        abort: new AbortController(),
        seenEventIds: new Set(),
        highestEventSeq: -1,
        terminalConfirmed: isExpertTerminalPhase(input.phase),
        reconnectAttempts: 0,
        pollStartedAt: null,
        pollTimer: null,
        accepted: null,
      };
      runs.set(input.request.clientRequestId, run);
      emit(run.projection);

      try {
        const snapshot = await gateway.getSnapshot(input.taskId);
        applySnapshot(run, snapshot);
        if (!run.terminalConfirmed) {
          void consumeSse(run);
        }
      } catch (err) {
        if (err instanceof ExpertGatewayError) {
          if (err.status === 403 || err.status === 401) {
            updateProjection(run, {
              phase: "unauthorized",
              errorCode: err.errorCode,
              errorMessage: err.message,
            });
          } else if (err.status === 404) {
            updateProjection(run, {
              phase: "expired",
              errorCode: err.errorCode,
              errorMessage: err.message,
            });
          } else {
            updateProjection(run, {
              phase: "failed",
              errorCode: err.errorCode,
              errorMessage: err.message,
            });
          }
        } else {
          updateProjection(run, {
            phase: "failed",
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return run.projection;
    },

    onProjectionChanged(listener: ExpertProjectionListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose(): void {
      if (disposed) return;
      accepting = false;
      disposed = true;
      for (const run of runs.values()) {
        run.abort.abort();
        if (run.pollTimer) {
          clearTimeout(run.pollTimer);
          run.pollTimer = null;
        }
      }
      runs.clear();
      listeners.clear();
      gateway.clearCache();
      gateway.dispose();
    },

    acceptingRequests(): boolean {
      return accepting && !disposed;
    },
  };

  return service;
}

let singleton: ExpertRunService | null = null;

export function getExpertRunService(): ExpertRunService {
  if (!singleton) {
    singleton = createExpertRunService();
  }
  return singleton;
}

export function setExpertRunServiceForTests(service: ExpertRunService | null): void {
  singleton = service;
}

export function resetExpertRunServiceForTests(): void {
  singleton?.dispose();
  singleton = null;
}

export { createClientRequestId, SSE_RECONNECT_DELAYS_MS, POLL_INTERVAL_MS, POLL_MAX_MS };
