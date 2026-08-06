/**
 * v8.1.1 — Profile-aware durable store + continuous sequence after restart.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/main/chat-runtime/chat-runtime-store-router", async () => {
  const actual = await vi.importActual<
    typeof import("../src/main/chat-runtime/chat-runtime-store-router")
  >("../src/main/chat-runtime/chat-runtime-store-router");
  return {
    ...actual,
    getStoreDb: () => null,
  };
});

import {
  __resetChatRuntimeStoreForTests,
  appendRuntimeEvent,
  getRun,
  listRuntimeEvents,
  upsertRun,
  upsertTurn,
} from "../src/main/chat-runtime/chat-runtime-store";
import {
  __resetChatEventSequencerForTests,
  clearAllTurnSequences,
  stampChatRuntimeEvent,
  syncTurnSequenceAfterAllocate,
} from "../src/main/chat-runtime/chat-event-sequencer";
import { allocateAndAppendEvent } from "../src/main/chat-runtime/chat-runtime-transaction";
import { __resetStoreRouterForTests } from "../src/main/chat-runtime/chat-runtime-store-router";
import { stateDbPathForProfile } from "../src/main/utils";

describe("profile-aware runtime store (v8.1.1)", () => {
  beforeEach(() => {
    __resetChatRuntimeStoreForTests();
    __resetChatEventSequencerForTests();
    __resetStoreRouterForTests();
  });

  afterEach(() => {
    __resetChatRuntimeStoreForTests();
    __resetChatEventSequencerForTests();
    __resetStoreRouterForTests();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Profile store isolation]]
  it("keeps two profiles isolated in memory fallback", () => {
    upsertRun({
      runId: "run-a",
      profileId: "coding",
      status: "streaming",
      pendingInteractions: [],
      lastEventSequence: 0,
      updatedAt: Date.now(),
    });
    upsertRun({
      runId: "run-b",
      profileId: "finance",
      status: "idle",
      pendingInteractions: [],
      lastEventSequence: 0,
      updatedAt: Date.now(),
    });

    expect(getRun("run-a", "coding")?.profileId).toBe("coding");
    expect(getRun("run-b", "finance")?.profileId).toBe("finance");
    expect(getRun("run-a", "finance")).toBeNull();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Sequence continuous after restart]]
  it("seeds sequencer from prior max sequence after clear", () => {
    const profileId = "default";
    upsertRun({
      runId: "r1",
      profileId,
      status: "streaming",
      pendingInteractions: [],
      lastEventSequence: 3,
      updatedAt: Date.now(),
    });
    upsertTurn({
      turnId: "t1",
      runId: "r1",
      profileId,
      status: "streaming",
      startedAt: Date.now(),
      lastSequence: 3,
    });
    for (let i = 1; i <= 3; i++) {
      appendRuntimeEvent(
        {
          eventId: `e${i}`,
          runId: "r1",
          turnId: "t1",
          sequence: i,
          type: "message.delta",
          emittedAt: Date.now(),
          payloadJson: "{}",
        },
        profileId,
      );
    }

    clearAllTurnSequences();
    const next = stampChatRuntimeEvent(
      {
        type: "message.delta",
        runId: "r1",
        turnId: "t1",
        content: "x",
      },
      profileId,
    );
    expect(next.sequence).toBe(4);
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Unique sequence conflict]]
  it("allocateAndAppend assigns monotonic sequences", () => {
    const profileId = "default";
    upsertRun({
      runId: "r2",
      profileId,
      status: "streaming",
      pendingInteractions: [],
      lastEventSequence: 0,
      updatedAt: Date.now(),
    });
    upsertTurn({
      turnId: "t2",
      runId: "r2",
      profileId,
      status: "streaming",
      startedAt: Date.now(),
      lastSequence: 0,
    });

    const a = allocateAndAppendEvent(
      profileId,
      { type: "message.delta", runId: "r2", turnId: "t2", content: "a" },
      (d) => stampChatRuntimeEvent(d, profileId),
    );
    syncTurnSequenceAfterAllocate(
      a.event.runId,
      a.event.turnId,
      a.event.sequence,
    );
    appendRuntimeEvent(
      {
        eventId: a.event.eventId,
        runId: a.event.runId,
        turnId: a.event.turnId,
        sequence: a.event.sequence,
        type: a.event.type,
        emittedAt: a.event.emittedAt,
        payloadJson: JSON.stringify(a.event),
      },
      profileId,
    );
    const b = allocateAndAppendEvent(
      profileId,
      { type: "message.delta", runId: "r2", turnId: "t2", content: "b" },
      (d) => stampChatRuntimeEvent(d, profileId),
    );
    expect(b.event.sequence).toBe(a.event.sequence + 1);
    appendRuntimeEvent(
      {
        eventId: b.event.eventId,
        runId: b.event.runId,
        turnId: b.event.turnId,
        sequence: b.event.sequence,
        type: b.event.type,
        emittedAt: b.event.emittedAt,
        payloadJson: JSON.stringify(b.event),
      },
      profileId,
    );
    const events = listRuntimeEvents("r2", "t2", profileId);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("stateDbPathForProfile isolates named profiles", () => {
    const def = stateDbPathForProfile();
    const coding = stateDbPathForProfile("coding");
    expect(def).not.toBe(coding);
    expect(coding.replace(/\\/g, "/")).toContain("/profiles/coding/");
  });
});
