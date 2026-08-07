import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/copilot-runtime-phase3-test",
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock("keytar", () => ({
  default: {
    getPassword: vi.fn(async () => null),
    setPassword: vi.fn(async () => undefined),
    deletePassword: vi.fn(async () => true),
  },
}));

const runtimeFetchMock = vi.fn();
const subscribeRuntimeSseMock = vi.fn(async () => undefined);

vi.mock("../src/main/copilot-runtime-client/runtime-http-client", async () => {
  const actual = await vi.importActual<
    typeof import("../src/main/copilot-runtime-client/runtime-http-client")
  >("../src/main/copilot-runtime-client/runtime-http-client");
  return {
    ...actual,
    runtimeFetch: (...args: unknown[]) => runtimeFetchMock(...args),
  };
});

vi.mock("../src/main/copilot-runtime-client/runtime-sse-client", () => ({
  subscribeRuntimeSse: (...args: unknown[]) => subscribeRuntimeSseMock(...args),
}));

vi.mock("../src/main/copilot-runtime-client/runtime-connection-manager", () => ({
  getRuntimeConnectionState: () => ({
    state: "Ready",
    ready: true,
    paired: true,
    baseUrl: "http://127.0.0.1:8765",
    port: 8765,
    deviceId: "dev-1",
    runtimeVersion: "1.6.1",
    runtimeApiVersion: "1.3",
    hermesVersion: null,
    compatibility: null,
    lastError: null,
    lastErrorCode: null,
    canRetry: true,
    canRepair: false,
    canPair: false,
    updatedAt: new Date().toISOString(),
  }),
}));

import {
  isServeChatTransportEnabled,
  isServeChatTransportPreferred,
  isLegacyHermesDirectAllowed,
} from "../src/main/copilot-runtime-client/runtime-mode";
import { chatRuntimeClient } from "../src/main/copilot-runtime-client/clients/chat-runtime-client";
import { ServeChatRuntimeAdapter } from "../src/main/runtime-adapters/ServeChatRuntimeAdapter";
import { ServeInstanceAdapter } from "../src/main/runtime-adapters/ServeInstanceAdapter";
import {
  mapServeChatEventToRuntimeEvent,
  normalizeServeChatEvent,
} from "../src/shared/copilot-runtime/chat-runtime-serve-contract";

describe("Phase 3 chat transport gates", () => {
  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Prefers Serve chat transport unless legacy-direct]]
  it("prefers Serve chat transport unless legacy-direct", () => {
    expect(
      isServeChatTransportPreferred(
        { COPILOT_ALLOW_LEGACY_HERMES_DIRECT: undefined },
        "development",
      ),
    ).toBe(true);
    expect(
      isServeChatTransportPreferred(
        { COPILOT_ALLOW_LEGACY_HERMES_DIRECT: "true" },
        "development",
      ),
    ).toBe(false);
    expect(isLegacyHermesDirectAllowed({ NODE_ENV: "production" }, "production")).toBe(
      false,
    );
  });

  it("enables Serve chat only when Ready and preferred", () => {
    expect(isServeChatTransportEnabled(true, {}, "development")).toBe(true);
    expect(isServeChatTransportEnabled(false, {}, "development")).toBe(false);
    expect(
      isServeChatTransportEnabled(
        true,
        { COPILOT_ALLOW_LEGACY_HERMES_DIRECT: "1" },
        "development",
      ),
    ).toBe(false);
  });
});

describe("ServeChatEvent mapping", () => {
  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Maps Serve chat events to Desktop runtime events]]
  it("maps agent.message.delta to message.delta", () => {
    const event = mapServeChatEventToRuntimeEvent({
      event_id: "e1",
      sequence: 3,
      run_id: "run-1",
      turn_id: "turn-1",
      type: "agent.message.delta",
      timestamp: "2026-01-01T00:00:00.000Z",
      payload: { content: "hello" },
    });
    expect(event).toMatchObject({
      type: "message.delta",
      content: "hello",
      eventId: "e1",
      sequence: 3,
      runId: "run-1",
      turnId: "turn-1",
    });
  });

  it("normalizeServeChatEvent accepts camelCase", () => {
    const n = normalizeServeChatEvent({
      eventId: "e2",
      sequence: 1,
      runId: "r",
      turnId: "t",
      type: "turn.completed",
      timestamp: "2026-01-01T00:00:00.000Z",
      payload: {},
    });
    expect(n?.eventId).toBe("e2");
    expect(mapServeChatEventToRuntimeEvent(n)?.type).toBe("completed");
  });
});

describe("chatRuntimeClient + ServeChatRuntimeAdapter", () => {
  beforeEach(() => {
    runtimeFetchMock.mockReset();
    subscribeRuntimeSseMock.mockReset();
    subscribeRuntimeSseMock.mockResolvedValue(undefined);
    ServeInstanceAdapter.clearCache();
  });

  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Serve chat-runs start awaits createRun and createTurn]]
  it("startTurn creates run+turn then subscribes SSE", async () => {
    runtimeFetchMock
      .mockResolvedValueOnce({ instance_id: "inst-1" }) // resolve
      .mockResolvedValueOnce({ accepted: true, run_id: "run-a", turn_id: "" }) // createRun
      .mockResolvedValueOnce({
        accepted: true,
        run_id: "run-a",
        turn_id: "turn-a",
        event_cursor: 0,
      }); // createTurn

    const sender = { isDestroyed: () => false, send: vi.fn() };
    const result = await ServeChatRuntimeAdapter.startTurn(
      {
        runId: "run-a",
        turnId: "turn-a",
        request: {
          profileId: "default",
          message: "hi",
          history: [],
          invocationSource: "default_chat",
        },
      },
      sender as never,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.runId).toBe("run-a");
      expect(result.turnId).toBe("turn-a");
    }
    expect(runtimeFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", path: "/api/v1/chat-runs" }),
    );
    expect(runtimeFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/chat-runs/run-a/turns",
      }),
    );
    expect(subscribeRuntimeSseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/chat-runs/run-a/events/stream",
      }),
    );
  });

  it("respondInteraction posts clarify answer", async () => {
    runtimeFetchMock.mockResolvedValueOnce({ ok: true });
    const result = await ServeChatRuntimeAdapter.command({
      type: "clarify.respond",
      runId: "run-1",
      turnId: "turn-1",
      requestId: "req-1",
      answer: "yes",
    });
    expect(result.ok).toBe(true);
    expect(runtimeFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/chat-runs/run-1/interactions/req-1/respond",
        body: { turnId: "turn-1", type: "clarify", answer: "yes" },
      }),
    );
  });

  it("abort calls Serve abort endpoint", async () => {
    runtimeFetchMock.mockResolvedValueOnce({ ok: true });
    await expect(ServeChatRuntimeAdapter.abort("run-z")).resolves.toEqual({
      ok: true,
    });
    expect(runtimeFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/chat-runs/run-z/abort",
      }),
    );
  });

  it("listEvents maps Serve payloads", async () => {
    runtimeFetchMock.mockResolvedValueOnce({
      events: [
        {
          event_id: "e9",
          sequence: 9,
          run_id: "run-x",
          turn_id: "turn-x",
          type: "ping",
          timestamp: "2026-01-01T00:00:00.000Z",
          payload: {},
        },
      ],
    });
    const events = await chatRuntimeClient.listEvents("run-x", { afterSequence: 0 });
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe("e9");
  });
});
