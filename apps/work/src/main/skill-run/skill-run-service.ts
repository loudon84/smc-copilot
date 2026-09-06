/**
 * Skill Run Service (Main Process Lifecycle Owner).
 * Owns active runs, SSE stream consumption, polling fallback, terminal state lock, and continuation.
 * Enforces fail-closed gate when consumer lock is missing.
 */

import { parseRunSseBlock } from "../run-stream";
import {
  createSkillRunGatewayClient,
  SkillRunGatewayClient,
  SkillRunGatewayError,
} from "./skill-run-gateway-client";
import {
  bindPromptFirstTool,
  parseSkillRunEvent,
  parseSkillRunStatusToPhase,
} from "./skill-run-contract-parser";
import { getSkillRunFeatureMode } from "./feature-mode-store";
import {
  fingerprintRequestId,
  recordSkillRunTelemetry,
  type SkillRunTelemetryEvent,
} from "./skill-run-telemetry";
import {
  isSkillRunTerminalPhase,
  type SkillCatalogResponse,
  type SkillRunArtifactDescriptor,
  type SkillRunCancelInput,
  type SkillRunCancelResult,
  type SkillRunFeatureMode,
  type SkillRunLocalPhase,
  type SkillRunProjection,
  type SkillRunRetryArtifactDiscoveryInput,
  type SkillRunStartInput,
  type SkillRunStartResult,
} from "../../shared/skill-run";

export type SkillRunProjectionListener = (projection: SkillRunProjection) => void;

export interface SkillRunService {
  listCatalog(): Promise<SkillCatalogResponse>;
  refreshCatalog(): Promise<SkillCatalogResponse>;
  start(input: SkillRunStartInput): Promise<SkillRunStartResult>;
  cancel(input: SkillRunCancelInput): Promise<SkillRunCancelResult>;
  getProjection(clientRequestId: string): SkillRunProjection | null;
  listProjections(sessionId: string): SkillRunProjection[];
  rehydrate(item: {
    clientRequestId: string;
    providerRunId: string | null;
    toolName: string;
    promptSummary: string;
    sessionId: string;
    profileId: string;
    authGeneration?: string;
    lastEventId: string | null;
    phase: SkillRunLocalPhase;
    text?: string;
    updatedAt: string;
  }): Promise<SkillRunProjection | null>;
  retryArtifactDiscovery(
    input: SkillRunRetryArtifactDiscoveryInput,
  ): Promise<SkillRunProjection | null>;
  getFeatureMode(): SkillRunFeatureMode;
  subscribe(listener: SkillRunProjectionListener): () => void;
  dispose(): void;
}

interface ActiveRun {
  request: SkillRunStartInput;
  projection: SkillRunProjection;
  promptField: string;
  callArguments: Record<string, unknown>;
  abort: AbortController;
  pollTimer: NodeJS.Timeout | null;
  terminalConfirmed: boolean;
  seenEventIds: Set<string>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultDisplayStage(phase: SkillRunLocalPhase): string {
  switch (phase) {
    case "pending-submit":
      return "Submitting skill request...";
    case "starting":
      return "Starting skill...";
    case "running":
      return "Executing skill...";
    case "waiting-approval":
      return "Waiting for approval...";
    case "discovering-artifacts":
      return "Discovering output artifacts...";
    case "succeeded":
      return "Skill completed successfully";
    case "failed":
      return "Skill execution failed";
    case "cancelled":
      return "Skill execution cancelled";
    case "expired":
      return "Skill execution expired";
    case "unauthorized":
      return "Unauthorized skill request";
    default:
      return "Processing...";
  }
}

export interface CreateSkillRunServiceOptions {
  gatewayClient?: SkillRunGatewayClient;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  getFeatureMode?: () => SkillRunFeatureMode;
  onPersistContinuation?: (projection: SkillRunProjection) => void;
  onUpsertArtifact?: (input: {
    meta: SkillRunArtifactDescriptor;
    runId: string;
    sessionId: string;
    profileId?: string;
    clientRequestId: string;
  }) => Promise<void>;
  recordTelemetry?: (event: SkillRunTelemetryEvent) => void;
}

export function createSkillRunService(
  options: CreateSkillRunServiceOptions = {},
): SkillRunService {
  const gateway = options.gatewayClient ?? createSkillRunGatewayClient();
  const getMode = options.getFeatureMode ?? getSkillRunFeatureMode;
  const persistContinuation = options.onPersistContinuation;
  const recordTelemetry = options.recordTelemetry ?? recordSkillRunTelemetry;
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
  const listeners = new Set<SkillRunProjectionListener>();
  let disposed = false;

  function emit(projection: SkillRunProjection): void {
    for (const listener of listeners) {
      try {
        listener(projection);
      } catch (err) {
        console.warn("[skill-run] listener error", err);
      }
    }
  }

  function updateProjection(
    run: ActiveRun,
    patch: Partial<SkillRunProjection>,
  ): SkillRunProjection {
    if (run.terminalConfirmed && patch.phase && !isSkillRunTerminalPhase(patch.phase)) {
      return run.projection;
    }

    const next: SkillRunProjection = {
      ...run.projection,
      ...patch,
      displayStage:
        patch.displayStage ??
        (patch.phase ? defaultDisplayStage(patch.phase) : run.projection.displayStage),
      updatedAt: nowIso(),
    };
    run.projection = next;

    if (next.phase && isSkillRunTerminalPhase(next.phase)) {
      run.terminalConfirmed = true;
      if (!run.abort.signal.aborted) {
        run.abort.abort();
      }
      if (run.pollTimer) {
        clearTimeout(run.pollTimer);
        run.pollTimer = null;
      }
    }

    emit(next);
    return next;
  }

  function hasActiveNonTerminalRun(sessionId: string): boolean {
    for (const run of runs.values()) {
      if (
        run.request.sessionId === sessionId &&
        !run.terminalConfirmed &&
        !isSkillRunTerminalPhase(run.projection.phase)
      ) {
        return true;
      }
    }
    return false;
  }

  function emitTelemetry(
    event: Omit<SkillRunTelemetryEvent, "at"> & { at?: string },
  ): void {
    try {
      recordTelemetry({
        at: event.at ?? nowIso(),
        event: event.event,
        featureMode: event.featureMode ?? getMode(),
        outcome: event.outcome,
        errorCode: event.errorCode,
        phase: event.phase,
        reconnectAttempt: event.reconnectAttempt,
        artifactItemCount: event.artifactItemCount,
        requestFingerprint: event.requestFingerprint,
      });
    } catch {
      // telemetry must never throw
    }
  }

  function rejectStart(
    input: SkillRunStartInput,
    errorCode: string,
    message: string,
  ): SkillRunStartResult {
    emitTelemetry({
      event: "start",
      outcome: "error",
      errorCode,
      requestFingerprint: fingerprintRequestId(input.clientRequestId),
    });
    if (errorCode === "RUN_ALREADY_ACTIVE") {
      emitTelemetry({
        event: "duplicate-prevented",
        outcome: "ok",
        errorCode,
        requestFingerprint: fingerprintRequestId(input.clientRequestId),
      });
    }
    return {
      accepted: false,
      errorCode,
      message,
      clientRequestId: input.clientRequestId,
    };
  }

  async function discoverArtifacts(run: ActiveRun, runId: string): Promise<void> {
    try {
      updateProjection(run, { phase: "discovering-artifacts" });
      const artifacts = await gateway.listRunArtifacts(runId);
      if (options.onUpsertArtifact) {
        for (const meta of artifacts) {
          try {
            await options.onUpsertArtifact({
              meta,
              runId,
              sessionId: run.request.sessionId,
              profileId: run.request.profileId,
              clientRequestId: run.request.clientRequestId,
            });
          } catch {
            // ignore individual artifact upsert error
          }
        }
      }
      updateProjection(run, {
        phase: "succeeded",
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        artifactDiscoveryError: false,
        artifactDiscoveryMessage: undefined,
      });
      emitTelemetry({
        event: "artifact",
        outcome: "ok",
        artifactItemCount: artifacts.length,
        requestFingerprint: fingerprintRequestId(run.request.clientRequestId),
      });
    } catch {
      // Artifact discovery failure does not fail a succeeded run
      updateProjection(run, {
        phase: "succeeded",
        artifactDiscoveryError: true,
        artifactDiscoveryMessage: "Failed to discover output artifacts",
      });
      emitTelemetry({
        event: "artifact",
        outcome: "error",
        errorCode: "ARTIFACT_DISCOVERY_FAILED",
        requestFingerprint: fingerprintRequestId(run.request.clientRequestId),
      });
    }
  }

  async function pollStatus(run: ActiveRun, runId: string): Promise<void> {
    if (run.terminalConfirmed || disposed) return;
    try {
      const snap = await gateway.getRunSnapshot(runId);
      const phase = parseSkillRunStatusToPhase(snap.status);
      if (phase === "succeeded") {
        run.terminalConfirmed = true;
        updateProjection(run, {
          providerRunId: snap.runId,
          phase: "succeeded",
          text: snap.resultText,
          artifacts: snap.artifacts,
        });
        emitTelemetry({
          event: "terminal",
          outcome: "ok",
          phase: "succeeded",
          requestFingerprint: fingerprintRequestId(run.request.clientRequestId),
        });
        await discoverArtifacts(run, runId);
      } else if (isSkillRunTerminalPhase(phase)) {
        run.terminalConfirmed = true;
        updateProjection(run, {
          providerRunId: snap.runId,
          phase,
          errorCode: snap.errorCode,
          errorMessage: snap.errorMessage,
        });
        emitTelemetry({
          event: "terminal",
          outcome: phase === "cancelled" ? "ok" : "error",
          phase,
          errorCode: snap.errorCode,
          requestFingerprint: fingerprintRequestId(run.request.clientRequestId),
        });
      } else {
        updateProjection(run, {
          providerRunId: snap.runId,
          phase,
        });
        if (!run.terminalConfirmed && !disposed) {
          run.pollTimer = setTimeout(() => {
            void pollStatus(run, runId);
          }, 4000);
        }
      }
    } catch (err) {
      if (!run.terminalConfirmed && !disposed) {
        run.pollTimer = setTimeout(() => {
          void pollStatus(run, runId);
        }, 5000);
      }
    }
  }

  async function consumeSse(run: ActiveRun, runId: string): Promise<void> {
    let reconnectAttempts = 0;
    const maxAttempts = 3;

    // Bounded poll runs while SSE is still open so a hung stream cannot block
    // Bundle terminal status. Post-disconnect poll remains as fallback below.
    if (!run.terminalConfirmed && !disposed) {
      void pollStatus(run, runId);
    }

    while (reconnectAttempts < maxAttempts && !run.terminalConfirmed && !disposed) {
      try {
        const res = await gateway.openEventStream(runId, {
          lastEventId: run.projection.lastEventId ?? undefined,
          signal: run.abort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE stream failed: ${res.status}`);
        }

        reconnectAttempts = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!run.terminalConfirmed && !disposed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const parsed = parseRunSseBlock(part);
            if (!parsed || !parsed.data) continue;

            if (parsed.id && run.seenEventIds.has(parsed.id)) {
              continue;
            }
            if (parsed.id) {
              run.seenEventIds.add(parsed.id);
            }

            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(parsed.data) as Record<string, unknown>;
            } catch {
              payload = { text: parsed.data };
            }

            const event = parseSkillRunEvent(parsed.eventType, payload);
            if (parsed.id) {
              event.eventId = parsed.id;
            }

            if (!event.rawUnknown) {
              const patch: Partial<SkillRunProjection> = {
                lastEventId: event.eventId ?? run.projection.lastEventId,
                eventSeq: event.eventSeq ?? run.projection.eventSeq + 1,
              };
              if (event.phase) patch.phase = event.phase;
              if (event.displayStage) patch.displayStage = event.displayStage;
              if (event.text) patch.text = event.text;
              if (event.errorCode) patch.errorCode = event.errorCode;
              if (event.errorMessage) patch.errorMessage = event.errorMessage;
              if (event.artifacts) patch.artifacts = event.artifacts;

              updateProjection(run, patch);

              if (event.phase === "succeeded") {
                run.terminalConfirmed = true;
                emitTelemetry({
                  event: "terminal",
                  outcome: "ok",
                  phase: "succeeded",
                  requestFingerprint: fingerprintRequestId(
                    run.request.clientRequestId,
                  ),
                });
                await discoverArtifacts(run, runId);
                return;
              }
            }
          }
        }
      } catch (err) {
        if (run.terminalConfirmed || disposed) return;
        reconnectAttempts++;
        emitTelemetry({
          event: "reconnect",
          outcome: "ok",
          reconnectAttempt: reconnectAttempts,
          requestFingerprint: fingerprintRequestId(run.request.clientRequestId),
        });
        if (reconnectAttempts < maxAttempts) {
          try {
            await sleep(1000 * reconnectAttempts, run.abort.signal);
          } catch {
            return;
          }
        }
      }
    }

    // Fall back to polling if SSE disconnected
    if (!run.terminalConfirmed && !disposed) {
      await pollStatus(run, runId);
    }
  }

  return {
    async listCatalog(): Promise<SkillCatalogResponse> {
      const catalog = await gateway.listCatalog();
      emitTelemetry({
        event: "catalog",
        outcome: catalog.status === "ready" ? "ok" : "error",
        errorCode: catalog.status === "ready" ? undefined : catalog.status,
      });
      return catalog;
    },

    async refreshCatalog(): Promise<SkillCatalogResponse> {
      gateway.clearCache();
      const catalog = await gateway.listCatalog();
      emitTelemetry({
        event: "catalog",
        outcome: catalog.status === "ready" ? "ok" : "error",
        errorCode: catalog.status === "ready" ? undefined : catalog.status,
      });
      return catalog;
    },

    async start(input: SkillRunStartInput): Promise<SkillRunStartResult> {
      if (disposed) {
        return rejectStart(input, "SERVICE_DISPOSED", "SkillRunService is disposed");
      }

      if (getMode() !== "skill-first") {
        return rejectStart(
          input,
          "START_DISABLED_FEATURE_MODE",
          "Skill Run start is disabled unless feature mode is skill-first.",
        );
      }

      if (!gateway.hasConsumerLock()) {
        return rejectStart(
          input,
          "START_DISABLED_NO_LOCK",
          "Skill Run Consumer Contract lock is not available; execution is disabled.",
        );
      }

      if (hasActiveNonTerminalRun(input.sessionId)) {
        return rejectStart(
          input,
          "RUN_ALREADY_ACTIVE",
          "A skill run is already active for this session.",
        );
      }

      const existing = runs.get(input.clientRequestId);
      if (existing) {
        emitTelemetry({
          event: "start",
          outcome: "ok",
          requestFingerprint: fingerprintRequestId(input.clientRequestId),
        });
        emitTelemetry({
          event: "duplicate-prevented",
          outcome: "ok",
          requestFingerprint: fingerprintRequestId(input.clientRequestId),
        });
        return {
          accepted: true,
          projection: existing.projection,
        };
      }

      const catalog = await gateway.listCatalog();
      emitTelemetry({
        event: "catalog",
        outcome: catalog.status === "ready" ? "ok" : "error",
        errorCode: catalog.status === "ready" ? undefined : catalog.status,
      });
      if (catalog.status !== "ready") {
        return rejectStart(
          input,
          "CATALOG_UNAVAILABLE",
          "Skill catalog is not ready for execution.",
        );
      }

      const bindResult = bindPromptFirstTool(
        input.toolName,
        input.prompt,
        catalog.tools,
      );
      if (!bindResult.ok) {
        return rejectStart(input, bindResult.errorCode, bindResult.message);
      }

      const validatedToolName = bindResult.tool.toolName;
      const createdAt = nowIso();
      const initialProjection: SkillRunProjection = {
        clientRequestId: input.clientRequestId,
        providerRunId: null,
        toolName: validatedToolName,
        promptSummary: input.prompt.slice(0, 120),
        sessionId: input.sessionId,
        profileId: input.profileId,
        authGeneration: input.authGeneration,
        phase: "pending-submit",
        displayStage: defaultDisplayStage("pending-submit"),
        lastEventId: null,
        eventSeq: 0,
        createdAt,
        updatedAt: createdAt,
      };

      const activeRun: ActiveRun = {
        request: { ...input, toolName: validatedToolName },
        projection: initialProjection,
        promptField: bindResult.promptField,
        callArguments: bindResult.arguments,
        abort: new AbortController(),
        pollTimer: null,
        terminalConfirmed: false,
        seenEventIds: new Set(),
      };

      runs.set(input.clientRequestId, activeRun);
      persistContinuation?.(initialProjection);
      emit(initialProjection);
      emitTelemetry({
        event: "start",
        outcome: "ok",
        requestFingerprint: fingerprintRequestId(input.clientRequestId),
      });

      void (async () => {
        try {
          updateProjection(activeRun, { phase: "starting" });
          if (process.env.SMC_SKILL_RUN_DEBUG === "1") {
            // eslint-disable-next-line no-console
            console.error("[skill-run][start] calling tools/call", {
              toolName: validatedToolName,
              promptField: activeRun.promptField,
              requestFingerprint: fingerprintRequestId(input.clientRequestId),
            });
          }
          const accepted = await gateway.callSkill({
            toolName: validatedToolName,
            arguments: activeRun.callArguments,
            idempotencyKey: input.clientRequestId,
          });

          updateProjection(activeRun, {
            providerRunId: accepted.runId,
            phase: "running",
          });
          emitTelemetry({
            event: "accepted",
            outcome: "ok",
            requestFingerprint: fingerprintRequestId(input.clientRequestId),
          });

          void consumeSse(activeRun, accepted.runId);
        } catch (err) {
          const message =
            err instanceof SkillRunGatewayError
              ? err.message
              : err instanceof Error
              ? err.message
              : "Skill execution start failed";
          const errorCode =
            err instanceof SkillRunGatewayError && err.errorCode
              ? err.errorCode
              : "START_FAILED";

          updateProjection(activeRun, {
            phase: "failed",
            errorCode,
            errorMessage: message,
          });
          emitTelemetry({
            event: "terminal",
            outcome: "error",
            phase: "failed",
            errorCode,
            requestFingerprint: fingerprintRequestId(input.clientRequestId),
          });
        }
      })();

      return {
        accepted: true,
        projection: initialProjection,
      };
    },

    async cancel(input: SkillRunCancelInput): Promise<SkillRunCancelResult> {
      const active = runs.get(input.clientRequestId);
      if (!active) {
        return {
          success: false,
          errorCode: "NO_ACTIVE_RUN",
          message: `No active skill run found for clientRequestId: ${input.clientRequestId}`,
        };
      }

      if (active.terminalConfirmed) {
        return {
          success: true,
          projection: active.projection,
        };
      }

      active.abort.abort();
      if (active.pollTimer) {
        clearTimeout(active.pollTimer);
        active.pollTimer = null;
      }

      const updated = updateProjection(active, {
        phase: "cancelled",
        displayStage: "Skill execution cancelled by user",
      });
      emitTelemetry({
        event: "terminal",
        outcome: "ok",
        phase: "cancelled",
        requestFingerprint: fingerprintRequestId(input.clientRequestId),
      });

      if (active.projection.providerRunId) {
        try {
          await gateway.cancelRun(active.projection.providerRunId);
        } catch {
          // ignore background cancel error
        }
      }

      return {
        success: true,
        projection: updated,
      };
    },

    getProjection(clientRequestId: string): SkillRunProjection | null {
      return runs.get(clientRequestId)?.projection ?? null;
    },

    listProjections(sessionId: string): SkillRunProjection[] {
      const list: SkillRunProjection[] = [];
      for (const r of runs.values()) {
        if (r.request.sessionId === sessionId) {
          list.push(r.projection);
        }
      }
      return list;
    },

    async rehydrate(item: {
      clientRequestId: string;
      providerRunId: string | null;
      toolName: string;
      promptSummary: string;
      sessionId: string;
      profileId: string;
      authGeneration?: string;
      lastEventId: string | null;
      phase: SkillRunLocalPhase;
      text?: string;
      updatedAt: string;
    }): Promise<SkillRunProjection | null> {
      if (runs.has(item.clientRequestId)) {
        return runs.get(item.clientRequestId)!.projection;
      }

      const projection: SkillRunProjection = {
        clientRequestId: item.clientRequestId,
        providerRunId: item.providerRunId,
        toolName: item.toolName,
        promptSummary: item.promptSummary,
        sessionId: item.sessionId,
        profileId: item.profileId,
        authGeneration: item.authGeneration,
        phase: item.phase,
        displayStage: defaultDisplayStage(item.phase),
        lastEventId: item.lastEventId,
        eventSeq: 0,
        text: item.text,
        createdAt: item.updatedAt,
        updatedAt: item.updatedAt,
      };

      const isTerminal = isSkillRunTerminalPhase(item.phase);
      const activeRun: ActiveRun = {
        request: {
          toolName: item.toolName,
          prompt: item.promptSummary,
          clientRequestId: item.clientRequestId,
          sessionId: item.sessionId,
          profileId: item.profileId,
          authGeneration: item.authGeneration,
        },
        projection,
        promptField: "prompt",
        callArguments: {},
        abort: new AbortController(),
        pollTimer: null,
        terminalConfirmed: isTerminal,
        seenEventIds: new Set(),
      };

      runs.set(item.clientRequestId, activeRun);

      if (!isTerminal && item.providerRunId && gateway.hasConsumerLock()) {
        void consumeSse(activeRun, item.providerRunId);
      }

      return projection;
    },

    async retryArtifactDiscovery(
      input: SkillRunRetryArtifactDiscoveryInput,
    ): Promise<SkillRunProjection | null> {
      const active = runs.get(input.clientRequestId);
      if (
        !active ||
        !active.projection.providerRunId ||
        active.request.sessionId !== input.sessionId
      ) {
        return null;
      }
      await discoverArtifacts(active, active.projection.providerRunId);
      return active.projection;
    },

    getFeatureMode(): SkillRunFeatureMode {
      return getMode();
    },

    subscribe(listener: SkillRunProjectionListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose(): void {
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
      gateway.dispose();
    },
  };
}
