import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetChatRuntimeStoreForTests,
  upsertPendingInteraction,
  upsertRun,
  upsertTurn,
  listIncompleteTurns,
} from "../src/main/chat-runtime/chat-runtime-store";
import { recoverIncompleteTurns } from "../src/main/chat-runtime/chat-recovery-coordinator";
import {
  stampChatRuntimeEvent,
  __resetChatEventSequencerForTests,
} from "../src/main/chat-runtime/chat-event-sequencer";

describe("chat runtime recovery (v8.1)", () => {
  beforeEach(() => {
    __resetChatRuntimeStoreForTests();
    __resetChatEventSequencerForTests();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Recovery waiting and interrupted]]
  it("restores waiting_approval when pending interaction exists", async () => {
    upsertRun({
      runId: "run-1",
      activeTurnId: "turn-1",
      profileId: "default",
      status: "streaming",
      pendingInteractions: [],
      lastEventSequence: 2,
      updatedAt: Date.now(),
    });
    upsertTurn({
      turnId: "turn-1",
      runId: "run-1",
      profileId: "default",
      status: "streaming",
      startedAt: Date.now(),
      lastSequence: 2,
    });
    upsertPendingInteraction({
      requestId: "req-1",
      runId: "run-1",
      turnId: "turn-1",
      interactionType: "approval",
      payloadJson: "{}",
      status: "pending",
      createdAt: Date.now(),
    });

    const recovered = await recoverIncompleteTurns();
    expect(recovered).toContain("run-1");
    const incomplete = listIncompleteTurns();
    expect(incomplete[0]?.status).toBe("waiting_approval");
  });

  it("marks streaming without pending as interrupted", async () => {
    upsertTurn({
      turnId: "turn-2",
      runId: "run-2",
      profileId: "default",
      status: "streaming",
      startedAt: Date.now(),
      lastSequence: 1,
    });
    upsertRun({
      runId: "run-2",
      activeTurnId: "turn-2",
      profileId: "default",
      status: "streaming",
      pendingInteractions: [],
      lastEventSequence: 1,
      updatedAt: Date.now(),
    });
    await recoverIncompleteTurns("run-2");
    expect(listIncompleteTurns().find((t) => t.runId === "run-2")).toBeUndefined();
  });

  it("drops duplicate / late sequences for renderer rule", () => {
    const e1 = stampChatRuntimeEvent({
      type: "message.delta",
      runId: "r",
      turnId: "t",
      content: "a",
    });
    const e2 = stampChatRuntimeEvent({
      type: "message.delta",
      runId: "r",
      turnId: "t",
      content: "b",
    });
    let last = 0;
    const apply = (seq: number): boolean => {
      if (seq <= last) return false;
      last = seq;
      return true;
    };
    expect(apply(e1.sequence)).toBe(true);
    expect(apply(e1.sequence)).toBe(false);
    expect(apply(e2.sequence)).toBe(true);
  });
});
