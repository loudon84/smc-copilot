/**
 * v8.1.1 — Hermes Interaction Continuation Adapter.
 * Native / Fallback mutually exclusive; returns completion Promise.
 * Capability tri-state: supported | unsupported | unknown.
 */

import type { WebContents } from "electron";
import type { ChatUsage } from "../../shared/chat-runtime/chat-runtime-events";
import type { ChatRuntimeEventDraft } from "../../shared/chat-runtime/chat-runtime-events";
import type { ChatTransportHandle } from "../../shared/chat-runtime/chat-runtime-state";
import type { ChatInvocationSource } from "../../shared/chat-runtime/chat-runtime-contract";
import {
  getApiUrl,
  getRemoteAuthHeader,
  isGatewayRunningAsync,
  isRemoteMode,
  sendMessage,
} from "../hermes";
import {
  afterExpertChatComplete,
  bridgeChatToolProgress,
} from "../hermes-experts/expert-run-bridge";
import { emitChatRuntimeEvent } from "./chat-event-emitter";
import {
  clearTransportHandle,
  setTransportHandle,
} from "./chat-transport-registry";
import {
  HermesChatCommandFailedError,
  HermesChatCommandUnsupportedError,
  __test as hermesCommandTest,
} from "./hermes-chat-command-adapter";

export type CapabilityState = "supported" | "unsupported" | "unknown";

export type HermesGatewayCapabilities = {
  clarify_response: CapabilityState;
  approval_response: CapabilityState;
  session_continuation: CapabilityState;
  probedAt: number;
  lastError?: string;
  gatewayVersion?: string;
};

export type DurableTurnRequestContext = {
  profileId: string;
  sessionId?: string;
  modelId?: string;
  expertId?: string;
  teamId?: string;
  expertRunId?: string;
  skillName?: string;
  workMode?: string;
  permissionMode?: string;
  invocationSource?: ChatInvocationSource;
  contextFolder?: string;
  attachmentIds?: string[];
  history?: Array<{ role: string; content: string }>;
};

export type ChatContinuationResult =
  | {
      ok: true;
      sessionId: string;
      response: string;
      usage?: ChatUsage;
      path: "native" | "fallback";
    }
  | {
      ok: false;
      code: string;
      error: string;
      path?: "native" | "fallback";
    };

export type ChatContinuationExecution = {
  handle: ChatTransportHandle;
  completion: Promise<ChatContinuationResult>;
};

export type ContinueClarifyInput = {
  runId: string;
  turnId: string;
  profileId: string;
  sessionId: string;
  requestId: string;
  answer: string;
  modelId?: string;
  context?: DurableTurnRequestContext;
  sender: WebContents;
};

export type ContinueApprovalInput = {
  runId: string;
  turnId: string;
  profileId: string;
  sessionId: string;
  requestId: string;
  decision: "approved" | "denied";
  reason?: string;
  modelId?: string;
  context?: DurableTurnRequestContext;
  sender: WebContents;
};

export interface HermesInteractionContinuationAdapter {
  probeCapabilities(profileId: string): Promise<HermesGatewayCapabilities>;
  continueClarify(input: ContinueClarifyInput): Promise<ChatContinuationExecution>;
  continueApproval(input: ContinueApprovalInput): Promise<ChatContinuationExecution>;
}

const CAPABILITY_TTL_MS = 60_000;
const capabilityCache = new Map<string, HermesGatewayCapabilities>();

function unknownCaps(lastError?: string): HermesGatewayCapabilities {
  return {
    clarify_response: "unknown",
    approval_response: "unknown",
    session_continuation: "unknown",
    probedAt: Date.now(),
    lastError,
  };
}

function toState(value: unknown): CapabilityState {
  if (value === true || value === "supported") return "supported";
  if (value === false || value === "unsupported") return "unsupported";
  return "unknown";
}

async function probeCapabilities(
  profileId: string,
): Promise<HermesGatewayCapabilities> {
  const cached = capabilityCache.get(profileId);
  if (cached && Date.now() - cached.probedAt < CAPABILITY_TTL_MS) {
    return cached;
  }

  const profile =
    profileId === "default" ? undefined : profileId.trim() || undefined;
  const base = getApiUrl(profile).replace(/\/+$/, "");

  try {
    const res = await fetch(`${base}/v1/capabilities`, {
      method: "GET",
      headers: {
        ...getRemoteAuthHeader(profile),
      },
    });
    if (!res.ok) {
      const caps = unknownCaps(`capabilities HTTP ${res.status}`);
      capabilityCache.set(profileId, caps);
      return caps;
    }
    const json = (await res.json()) as Record<string, unknown>;
    const raw = (json.capabilities ?? json) as Record<string, unknown>;
    const result: HermesGatewayCapabilities = {
      clarify_response: toState(raw.clarify_response),
      approval_response: toState(raw.approval_response),
      session_continuation: toState(raw.session_continuation),
      probedAt: Date.now(),
      gatewayVersion:
        typeof raw.gateway_version === "string"
          ? raw.gateway_version
          : typeof json.version === "string"
            ? json.version
            : undefined,
    };
    capabilityCache.set(profileId, result);
    return result;
  } catch (err) {
    const caps = unknownCaps(
      err instanceof Error ? err.message : String(err),
    );
    capabilityCache.set(profileId, caps);
    return caps;
  }
}

async function callNativeEndpoint(input: {
  profileId: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<void> {
  const profile =
    input.profileId === "default" ? undefined : input.profileId.trim() || undefined;
  if (!isRemoteMode() && !(await isGatewayRunningAsync(profile))) {
    throw new HermesChatCommandUnsupportedError(
      "Gateway is not running; cannot continue interaction",
    );
  }
  const base = getApiUrl(profile).replace(/\/+$/, "");
  const res = await fetch(`${base}${input.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getRemoteAuthHeader(profile),
    },
    body: JSON.stringify(input.body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HermesChatCommandFailedError(
      `Native interaction API failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

function emitDraft(
  sender: WebContents,
  draft: ChatRuntimeEventDraft,
): boolean {
  return emitChatRuntimeEvent(sender, draft);
}

function startStreamingContinuation(input: {
  runId: string;
  turnId: string;
  profileId: string;
  sessionId: string;
  message: string;
  modelId?: string;
  context?: DurableTurnRequestContext;
  sender: WebContents;
  path: "native" | "fallback";
}): ChatContinuationExecution {
  const ctx = input.context;
  const profile =
    input.profileId === "default" ? undefined : input.profileId.trim() || undefined;
  let aborted = false;
  let chatHandle: { abort: () => void } | null = null;
  let fullResponse = "";
  let lastUsage: ChatUsage | undefined;
  let resolvedSessionId = input.sessionId;

  let resolveCompletion!: (result: ChatContinuationResult) => void;
  const completion = new Promise<ChatContinuationResult>((res) => {
    resolveCompletion = res;
  });

  const handle: ChatTransportHandle = {
    runId: input.runId,
    turnId: input.turnId,
    abort() {
      aborted = true;
      try {
        chatHandle?.abort();
      } catch {
        /* best effort */
      }
      clearTransportHandle(input.runId, input.turnId);
      resolveCompletion({
        ok: false,
        code: "CANCELLED",
        error: "Continuation aborted",
        path: input.path,
      });
    },
  };
  setTransportHandle(handle);

  void (async () => {
    try {
      const result = await sendMessage(
        input.message,
        {
          onChunk: (chunk) => {
            if (aborted) return;
            fullResponse += chunk;
            emitDraft(input.sender, {
              type: "message.delta",
              runId: input.runId,
              turnId: input.turnId,
              content: chunk,
            });
          },
          onSessionStarted: (sessionId) => {
            if (aborted || !sessionId) return;
            resolvedSessionId = sessionId;
            emitDraft(input.sender, {
              type: "session.started",
              runId: input.runId,
              turnId: input.turnId,
              sessionId,
            });
          },
          onDone: (sessionId) => {
            if (aborted) return;
            resolvedSessionId = sessionId || resolvedSessionId;
            void afterExpertChatComplete({
              runId: ctx?.expertRunId,
              profile,
              response: fullResponse,
              sessionId: resolvedSessionId,
            });
            emitDraft(input.sender, {
              type: "completed",
              runId: input.runId,
              turnId: input.turnId,
              sessionId: resolvedSessionId,
            });
            clearTransportHandle(input.runId, input.turnId);
            resolveCompletion({
              ok: true,
              sessionId: resolvedSessionId,
              response: fullResponse,
              usage: lastUsage,
              path: input.path,
            });
          },
          onError: (error) => {
            if (aborted) return;
            void afterExpertChatComplete({
              runId: ctx?.expertRunId,
              profile,
              response: fullResponse,
              error,
            });
            emitDraft(input.sender, {
              type: "failed",
              runId: input.runId,
              turnId: input.turnId,
              error: { code: "COMMAND_FAILED", message: error },
            });
            clearTransportHandle(input.runId, input.turnId);
            resolveCompletion({
              ok: false,
              code: "COMMAND_FAILED",
              error,
              path: input.path,
            });
          },
          onToolProgress: (tool) => {
            if (aborted) return;
            bridgeChatToolProgress({
              runId: ctx?.expertRunId,
              profile,
              expertId: ctx?.expertId,
              toolLabel: tool,
            });
            emitDraft(input.sender, {
              type: "tool.progress",
              runId: input.runId,
              turnId: input.turnId,
              tool,
            });
          },
          onReasoningDelta: (content) => {
            if (aborted) return;
            emitDraft(input.sender, {
              type: "reasoning.delta",
              runId: input.runId,
              turnId: input.turnId,
              content,
            });
          },
          onToolEvent: (toolEvent) => {
            if (aborted) return;
            emitDraft(input.sender, {
              type: "tool.event",
              runId: input.runId,
              turnId: input.turnId,
              event: toolEvent,
            });
          },
          onUsage: (usage) => {
            if (aborted) return;
            lastUsage = {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              cost: usage.cost,
              rateLimitRemaining: usage.rateLimitRemaining,
              rateLimitReset: usage.rateLimitReset,
            };
            emitDraft(input.sender, {
              type: "usage",
              runId: input.runId,
              turnId: input.turnId,
              usage: lastUsage,
            });
          },
        },
        profile,
        input.sessionId,
        ctx?.history,
        {
          modelId: input.modelId || ctx?.modelId,
          sessionId: input.sessionId,
          attachmentIds: ctx?.attachmentIds,
        },
      );
      chatHandle = result;
    } catch (err) {
      if (aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      emitDraft(input.sender, {
        type: "failed",
        runId: input.runId,
        turnId: input.turnId,
        error: { code: "COMMAND_FAILED", message },
      });
      clearTransportHandle(input.runId, input.turnId);
      resolveCompletion({
        ok: false,
        code: "COMMAND_FAILED",
        error: message,
        path: input.path,
      });
    }
  })();

  return { handle, completion };
}

function requireSession(sessionId: string): void {
  if (!sessionId?.trim()) {
    throw new HermesChatCommandFailedError(
      "sessionId is required for interaction continuation",
    );
  }
}

function resolveNativeCompletion(input: {
  runId: string;
  turnId: string;
  sessionId: string;
  sender: WebContents;
  context?: DurableTurnRequestContext;
}): ChatContinuationExecution {
  const handle: ChatTransportHandle = {
    runId: input.runId,
    turnId: input.turnId,
    abort() {
      clearTransportHandle(input.runId, input.turnId);
    },
  };
  setTransportHandle(handle);

  const completion = (async (): Promise<ChatContinuationResult> => {
    emitDraft(input.sender, {
      type: "completed",
      runId: input.runId,
      turnId: input.turnId,
      sessionId: input.sessionId,
    });
    clearTransportHandle(input.runId, input.turnId);
    await afterExpertChatComplete({
      runId: input.context?.expertRunId,
      profile:
        input.context?.profileId === "default"
          ? undefined
          : input.context?.profileId,
      response: "",
      sessionId: input.sessionId,
    });
    return {
      ok: true,
      sessionId: input.sessionId,
      response: "",
      path: "native",
    };
  })();

  return { handle, completion };
}

export function createHermesInteractionContinuationAdapter(): HermesInteractionContinuationAdapter {
  // @lat: [[domain/chat#Interaction continuation]]
  return {
    probeCapabilities,

    async continueClarify(input) {
      requireSession(input.sessionId);
      const caps = await probeCapabilities(input.profileId);

      emitDraft(input.sender, {
        type: "interaction.continuing",
        runId: input.runId,
        turnId: input.turnId,
        requestId: input.requestId,
        interactionType: "clarify",
      });

      // Native path — mutually exclusive with fallback (no structured follow-up).
      if (caps.clarify_response === "supported") {
        await callNativeEndpoint({
          profileId: input.profileId,
          path: "/v1/interactions/clarify",
          body: {
            request_id: input.requestId,
            session_id: input.sessionId,
            answer: input.answer,
          },
        });
        return resolveNativeCompletion(input);
      }

      if (caps.session_continuation === "supported") {
        const message = hermesCommandTest.buildClarifyFollowUp(
          input.requestId,
          input.answer,
        );
        return startStreamingContinuation({
          runId: input.runId,
          turnId: input.turnId,
          profileId: input.profileId,
          sessionId: input.sessionId,
          message,
          modelId: input.modelId,
          context: input.context,
          sender: input.sender,
          path: "fallback",
        });
      }

      throw new HermesChatCommandUnsupportedError(
        caps.session_continuation === "unknown" ||
          caps.clarify_response === "unknown"
          ? "Gateway capabilities unknown; cannot continue clarify"
          : "Gateway does not support clarify continuation",
      );
    },

    async continueApproval(input) {
      requireSession(input.sessionId);
      const caps = await probeCapabilities(input.profileId);

      emitDraft(input.sender, {
        type: "interaction.continuing",
        runId: input.runId,
        turnId: input.turnId,
        requestId: input.requestId,
        interactionType: "approval",
      });

      if (caps.approval_response === "supported") {
        await callNativeEndpoint({
          profileId: input.profileId,
          path: "/v1/interactions/approval",
          body: {
            request_id: input.requestId,
            session_id: input.sessionId,
            decision: input.decision,
            reason: input.reason,
          },
        });
        return resolveNativeCompletion(input);
      }

      if (caps.session_continuation === "supported") {
        const message = hermesCommandTest.buildApprovalFollowUp(
          input.requestId,
          input.decision,
          input.reason,
        );
        return startStreamingContinuation({
          runId: input.runId,
          turnId: input.turnId,
          profileId: input.profileId,
          sessionId: input.sessionId,
          message,
          modelId: input.modelId,
          context: input.context,
          sender: input.sender,
          path: "fallback",
        });
      }

      throw new HermesChatCommandUnsupportedError(
        caps.session_continuation === "unknown" ||
          caps.approval_response === "unknown"
          ? "Gateway capabilities unknown; cannot continue approval"
          : "Gateway does not support approval continuation",
      );
    },
  };
}

export function __resetContinuationCapabilityCacheForTests(): void {
  capabilityCache.clear();
}

/** Test helpers */
export const __test = {
  toState,
  unknownCaps,
};
