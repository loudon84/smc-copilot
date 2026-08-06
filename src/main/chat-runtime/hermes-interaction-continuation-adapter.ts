/**
 * v8.1 — Hermes Interaction Continuation Adapter.
 * Priority: native capability → streaming session continuation → GATEWAY_UNSUPPORTED.
 */

import type { WebContents } from "electron";
import type { ChatRuntimeEventDraft } from "../../shared/chat-runtime/chat-runtime-events";
import type { ChatTransportHandle } from "../../shared/chat-runtime/chat-runtime-state";
import {
  getApiUrl,
  getRemoteAuthHeader,
  isGatewayRunning,
  isRemoteMode,
  sendMessage,
} from "../hermes";
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

export type HermesGatewayCapabilities = {
  clarify_response: boolean;
  approval_response: boolean;
  session_continuation: boolean;
  probedAt: number;
};

export type ContinueClarifyInput = {
  runId: string;
  turnId: string;
  profileId: string;
  sessionId: string;
  requestId: string;
  answer: string;
  modelId?: string;
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
  sender: WebContents;
};

export interface HermesInteractionContinuationAdapter {
  probeCapabilities(profileId: string): Promise<HermesGatewayCapabilities>;
  continueClarify(input: ContinueClarifyInput): Promise<ChatTransportHandle>;
  continueApproval(input: ContinueApprovalInput): Promise<ChatTransportHandle>;
}

const CAPABILITY_TTL_MS = 60_000;
const capabilityCache = new Map<string, HermesGatewayCapabilities>();

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
  const defaults: HermesGatewayCapabilities = {
    clarify_response: false,
    approval_response: false,
    session_continuation: true,
    probedAt: Date.now(),
  };

  try {
    const res = await fetch(`${base}/v1/capabilities`, {
      method: "GET",
      headers: {
        ...getRemoteAuthHeader(profile),
      },
    });
    if (!res.ok) {
      capabilityCache.set(profileId, defaults);
      return defaults;
    }
    const json = (await res.json()) as Record<string, unknown>;
    const caps = (json.capabilities ?? json) as Record<string, unknown>;
    const result: HermesGatewayCapabilities = {
      clarify_response: Boolean(caps.clarify_response),
      approval_response: Boolean(caps.approval_response),
      session_continuation:
        caps.session_continuation === undefined
          ? true
          : Boolean(caps.session_continuation),
      probedAt: Date.now(),
    };
    capabilityCache.set(profileId, result);
    return result;
  } catch {
    capabilityCache.set(profileId, defaults);
    return defaults;
  }
}

async function callNativeEndpoint(input: {
  profileId: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<void> {
  const profile =
    input.profileId === "default" ? undefined : input.profileId.trim() || undefined;
  if (!isRemoteMode() && !isGatewayRunning(profile)) {
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
  sender: WebContents;
  onSettled?: () => void;
}): ChatTransportHandle {
  const profile =
    input.profileId === "default" ? undefined : input.profileId.trim() || undefined;
  let aborted = false;
  let chatHandle: { abort: () => void } | null = null;

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
            emitDraft(input.sender, {
              type: "message.delta",
              runId: input.runId,
              turnId: input.turnId,
              content: chunk,
            });
          },
          onSessionStarted: (sessionId) => {
            if (aborted || !sessionId) return;
            emitDraft(input.sender, {
              type: "session.started",
              runId: input.runId,
              turnId: input.turnId,
              sessionId,
            });
          },
          onDone: (sessionId) => {
            if (aborted) return;
            emitDraft(input.sender, {
              type: "completed",
              runId: input.runId,
              turnId: input.turnId,
              sessionId: sessionId || input.sessionId,
            });
            clearTransportHandle(input.runId, input.turnId);
            input.onSettled?.();
          },
          onError: (error) => {
            if (aborted) return;
            emitDraft(input.sender, {
              type: "failed",
              runId: input.runId,
              turnId: input.turnId,
              error: { code: "COMMAND_FAILED", message: error },
            });
            clearTransportHandle(input.runId, input.turnId);
            input.onSettled?.();
          },
          onToolProgress: (tool) => {
            if (aborted) return;
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
            emitDraft(input.sender, {
              type: "usage",
              runId: input.runId,
              turnId: input.turnId,
              usage: {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                cost: usage.cost,
                rateLimitRemaining: usage.rateLimitRemaining,
                rateLimitReset: usage.rateLimitReset,
              },
            });
          },
        },
        profile,
        input.sessionId,
        undefined,
        {
          modelId: input.modelId,
          sessionId: input.sessionId,
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
      input.onSettled?.();
    }
  })();

  return handle;
}

export function createHermesInteractionContinuationAdapter(): HermesInteractionContinuationAdapter {
  // @lat: [[domain/chat#Interaction continuation]]
  return {
    probeCapabilities,

    async continueClarify(input) {
      const caps = await probeCapabilities(input.profileId);
      emitDraft(input.sender, {
        type: "interaction.continuing",
        runId: input.runId,
        turnId: input.turnId,
        requestId: input.requestId,
        interactionType: "clarify",
      });

      if (caps.clarify_response) {
        await callNativeEndpoint({
          profileId: input.profileId,
          path: "/v1/interactions/clarify",
          body: {
            request_id: input.requestId,
            session_id: input.sessionId,
            answer: input.answer,
          },
        });
        // Native may still stream via same session — use streaming continuation as monitor.
      }

      if (!caps.session_continuation && !caps.clarify_response) {
        throw new HermesChatCommandUnsupportedError(
          "Gateway does not support clarify continuation",
        );
      }

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
        sender: input.sender,
      });
    },

    async continueApproval(input) {
      const caps = await probeCapabilities(input.profileId);
      emitDraft(input.sender, {
        type: "interaction.continuing",
        runId: input.runId,
        turnId: input.turnId,
        requestId: input.requestId,
        interactionType: "approval",
      });

      if (caps.approval_response) {
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
      }

      if (!caps.session_continuation && !caps.approval_response) {
        throw new HermesChatCommandUnsupportedError(
          "Gateway does not support approval continuation",
        );
      }

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
        sender: input.sender,
      });
    },
  };
}

export function __resetContinuationCapabilityCacheForTests(): void {
  capabilityCache.clear();
}
