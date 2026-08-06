import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetChatRuntimeStoreForTests,
  getPendingInteraction,
  getRun,
  listPendingInteractions,
  upsertPendingInteraction,
  upsertRun,
  upsertTurn,
} from "../src/main/chat-runtime/chat-runtime-store";
import {
  __resetTransportRegistryForTests,
  clearTransportHandle,
  getTransportHandle,
  setTransportHandle,
} from "../src/main/chat-runtime/chat-transport-registry";

describe("durable chat runtime store (v8.1)", () => {
  beforeEach(() => {
    __resetChatRuntimeStoreForTests();
    __resetTransportRegistryForTests();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Pending survives transport clear]]
  it("keeps pending interaction after transport cleared", () => {
    upsertRun({
      runId: "run-1",
      activeTurnId: "turn-1",
      profileId: "default",
      status: "waiting_approval",
      pendingInteractions: [],
      lastEventSequence: 3,
      updatedAt: Date.now(),
    });
    upsertTurn({
      turnId: "turn-1",
      runId: "run-1",
      profileId: "default",
      status: "waiting_approval",
      startedAt: Date.now(),
      lastSequence: 3,
    });
    upsertPendingInteraction({
      requestId: "req-1",
      runId: "run-1",
      turnId: "turn-1",
      interactionType: "approval",
      payloadJson: JSON.stringify({ toolName: "shell" }),
      status: "pending",
      createdAt: Date.now(),
    });

    setTransportHandle({
      runId: "run-1",
      turnId: "turn-1",
      abort: () => undefined,
    });
    clearTransportHandle("run-1", "turn-1");
    expect(getTransportHandle("run-1", "turn-1")).toBeUndefined();

    // Durable state survives transport cleanup.
    expect(getRun("run-1")?.status).toBe("waiting_approval");
    expect(getPendingInteraction("req-1")?.status).toBe("pending");
    expect(listPendingInteractions("run-1")).toHaveLength(1);
  });
});
