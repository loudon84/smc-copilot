/**
 * v8.1.1 — Interaction correctness: native/fallback mutex, capability tri-state,
 * resolved only after continuation completion.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  createHermesInteractionContinuationAdapter,
  __resetContinuationCapabilityCacheForTests,
  __test as capsTest,
} from "../src/main/chat-runtime/hermes-interaction-continuation-adapter";
import { HermesChatCommandUnsupportedError } from "../src/main/chat-runtime/hermes-chat-command-adapter";

vi.mock("../src/main/hermes", () => ({
  getApiUrl: () => "http://127.0.0.1:8642",
  getRemoteAuthHeader: () => ({}),
  isGatewayRunning: () => true,
  isRemoteMode: () => false,
  sendMessage: vi.fn(async (_msg: string, cb: {
    onDone?: (s?: string) => void;
  }) => {
    queueMicrotask(() => cb.onDone?.("sess-1"));
    return { abort: () => undefined };
  }),
}));

vi.mock("../src/main/hermes-experts/expert-run-bridge", () => ({
  afterExpertChatComplete: vi.fn(async () => undefined),
  bridgeChatToolProgress: vi.fn(),
}));

vi.mock("../src/main/chat-runtime/chat-event-emitter", () => ({
  emitChatRuntimeEvent: vi.fn(() => true),
}));

vi.mock("../src/main/chat-runtime/chat-transport-registry", () => ({
  setTransportHandle: vi.fn(),
  clearTransportHandle: vi.fn(),
}));

const mockSender = {} as Electron.WebContents;

describe("interaction correctness (v8.1.1)", () => {
  beforeEach(() => {
    __resetContinuationCapabilityCacheForTests();
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/v1/capabilities")) {
          return {
            ok: true,
            json: async () => ({
              clarify_response: false,
              approval_response: false,
              session_continuation: true,
            }),
          };
        }
        if (String(url).includes("/v1/interactions/")) {
          return { ok: true, text: async () => "" };
        }
        return {
          ok: false,
          status: 404,
          text: async () => "not found",
          json: async () => ({}),
        };
      }),
    );
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Capability tri-state]]
  it("maps capability values to tri-state", () => {
    expect(capsTest.toState(true)).toBe("supported");
    expect(capsTest.toState(false)).toBe("unsupported");
    expect(capsTest.toState(undefined)).toBe("unknown");
    expect(capsTest.unknownCaps("x").session_continuation).toBe("unknown");
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Unknown capability does not default continue]]
  it("unknown capability does not fall through to fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const adapter = createHermesInteractionContinuationAdapter();
    await expect(
      adapter.continueClarify({
        runId: "r1",
        turnId: "t1",
        profileId: "default",
        sessionId: "s1",
        requestId: "req1",
        answer: "yes",
        sender: mockSender,
      }),
    ).rejects.toBeInstanceOf(HermesChatCommandUnsupportedError);
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Native and fallback mutually exclusive]]
  it("native clarify does not call sendMessage fallback", async () => {
    const { sendMessage } = await import("../src/main/hermes");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/v1/capabilities")) {
          return {
            ok: true,
            json: async () => ({
              clarify_response: true,
              approval_response: false,
              session_continuation: true,
            }),
          };
        }
        return { ok: true, text: async () => "" };
      }),
    );
    const adapter = createHermesInteractionContinuationAdapter();
    const execution = await adapter.continueClarify({
      runId: "r1",
      turnId: "t1",
      profileId: "default",
      sessionId: "s1",
      requestId: "req1",
      answer: "yes",
      sender: mockSender,
    });
    const result = await execution.completion;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.path).toBe("native");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Resolved after completion]]
  it("fallback clarify completion resolves after stream done", async () => {
    const adapter = createHermesInteractionContinuationAdapter();
    const execution = await adapter.continueClarify({
      runId: "r1",
      turnId: "t1",
      profileId: "default",
      sessionId: "s1",
      requestId: "req1",
      answer: "yes",
      sender: mockSender,
    });
    expect(execution.handle.runId).toBe("r1");
    const result = await execution.completion;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.path).toBe("fallback");
  });

  it("requires sessionId", async () => {
    const adapter = createHermesInteractionContinuationAdapter();
    await expect(
      adapter.continueClarify({
        runId: "r1",
        turnId: "t1",
        profileId: "default",
        sessionId: "",
        requestId: "req1",
        answer: "yes",
        sender: mockSender,
      }),
    ).rejects.toThrow(/sessionId/i);
  });
});
