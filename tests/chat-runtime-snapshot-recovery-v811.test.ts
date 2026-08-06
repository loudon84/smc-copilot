/**
 * v8.1.1 — Snapshot / recovery service.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("../src/main/chat-runtime/chat-runtime-store-router", async () => {
  const actual = await vi.importActual<
    typeof import("../src/main/chat-runtime/chat-runtime-store-router")
  >("../src/main/chat-runtime/chat-runtime-store-router");
  return { ...actual, getStoreDb: () => null };
});

import {
  __resetChatRuntimeStoreForTests,
  appendRuntimeEvent,
  upsertPendingInteraction,
  upsertQueueEntry,
  upsertRun,
  upsertTurn,
} from "../src/main/chat-runtime/chat-runtime-store";
import {
  getChatRuntimeSnapshot,
  replayChatRuntimeEvents,
} from "../src/main/chat-runtime/chat-event-replay-service";

describe("chat runtime snapshot recovery (v8.1.1)", () => {
  beforeEach(() => {
    __resetChatRuntimeStoreForTests();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Snapshot recovery]]
  it("builds snapshot with pending, queue, and events", () => {
    upsertRun({
      runId: "run-s",
      profileId: "default",
      status: "waiting_clarify",
      pendingInteractions: [],
      lastEventSequence: 2,
      updatedAt: Date.now(),
    });
    upsertTurn({
      turnId: "t1",
      runId: "run-s",
      profileId: "default",
      status: "waiting_clarify",
      startedAt: Date.now(),
      lastSequence: 2,
    });
    upsertPendingInteraction(
      {
        requestId: "req-1",
        runId: "run-s",
        turnId: "t1",
        interactionType: "clarify",
        payloadJson: "{}",
        status: "pending",
        createdAt: Date.now(),
      },
      "default",
    );
    upsertQueueEntry(
      {
        queueId: "q1",
        runId: "run-s",
        position: 0,
        snapshotJson: "{}",
        status: "queued",
        createdAt: Date.now(),
      },
      "default",
    );
    appendRuntimeEvent(
      {
        eventId: "e1",
        runId: "run-s",
        turnId: "t1",
        sequence: 1,
        type: "message.delta",
        emittedAt: Date.now(),
        payloadJson: JSON.stringify({
          type: "message.delta",
          runId: "run-s",
          turnId: "t1",
          content: "hi",
          eventId: "e1",
          sequence: 1,
          emittedAt: Date.now(),
        }),
      },
      "default",
    );
    appendRuntimeEvent(
      {
        eventId: "e2",
        runId: "run-s",
        turnId: "t1",
        sequence: 2,
        type: "clarify.requested",
        emittedAt: Date.now(),
        payloadJson: "{}",
      },
      "default",
    );

    const snap = getChatRuntimeSnapshot({ runId: "run-s", profileId: "default" });
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.snapshot.pendingInteractions).toHaveLength(1);
    expect(snap.snapshot.queue).toHaveLength(1);
    expect(snap.snapshot.events.length).toBeGreaterThanOrEqual(2);
    expect(snap.snapshot.lastEventSequence).toBeGreaterThanOrEqual(2);
  });

  it("replays events after sequence watermark", () => {
    upsertRun({
      runId: "run-r",
      profileId: "default",
      status: "streaming",
      pendingInteractions: [],
      lastEventSequence: 3,
      updatedAt: Date.now(),
    });
    for (let i = 1; i <= 3; i++) {
      appendRuntimeEvent(
        {
          eventId: `er${i}`,
          runId: "run-r",
          turnId: "t",
          sequence: i,
          type: "message.delta",
          emittedAt: Date.now(),
          payloadJson: "{}",
        },
        "default",
      );
    }
    const replay = replayChatRuntimeEvents({
      runId: "run-r",
      profileId: "default",
      afterSequence: 1,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.events.every((e) => e.sequence > 1)).toBe(true);
    expect(replay.events).toHaveLength(2);
  });
});
