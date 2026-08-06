/**
 * v8.1.1 — Queue IPC + turn retry planning wiring.
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
  listQueueEntries,
  upsertRun,
} from "../src/main/chat-runtime/chat-runtime-store";
import {
  completeQueueEntry,
  enqueueChatMessage,
  moveQueuedMessage,
  removeQueuedMessage,
} from "../src/main/chat-runtime/chat-queue-service";
import {
  planRetryTurn,
} from "../src/renderer/src/modules/chat/controller/chatRetryService";
import type { ChatTurnLedger } from "../src/renderer/src/modules/chat/controller/chatTurnLedger";
import type { ChatTurnRequestSnapshot } from "../src/renderer/src/modules/chat/controller/chatTurnSnapshot";

describe("chat queue + retry wiring (v8.1.1)", () => {
  beforeEach(() => {
    __resetChatRuntimeStoreForTests();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Queue durable ipc]]
  it("enqueues and reorders durable queue entries", () => {
    upsertRun({
      runId: "rq",
      profileId: "default",
      status: "streaming",
      pendingInteractions: [],
      lastEventSequence: 0,
      updatedAt: Date.now(),
    });
    const a = enqueueChatMessage({
      runId: "rq",
      profileId: "default",
      snapshotJson: JSON.stringify({ text: "a" }),
    });
    const b = enqueueChatMessage({
      runId: "rq",
      profileId: "default",
      snapshotJson: JSON.stringify({ text: "b" }),
    });
    expect(listQueueEntries("rq", "default")).toHaveLength(2);
    const moved = moveQueuedMessage({
      runId: "rq",
      profileId: "default",
      queueId: b.queueId,
      toPosition: 0,
    });
    expect(moved[0]?.queueId).toBe(b.queueId);
    removeQueuedMessage(a.queueId, "rq", "default");
    completeQueueEntry(b.queueId, "rq", "completed", "default");
    expect(listQueueEntries("rq", "default")).toHaveLength(0);
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Turn specific retry]]
  it("plans retry from specific turnId in ledger", () => {
    const snap: ChatTurnRequestSnapshot = {
      turnId: "turn-err",
      profileId: "default",
      rawText: "hello",
      effectiveText: "hello",
      attachments: [],
      modelId: null,
      sessionId: null,
      invocationSource: "default_chat",
      createdAt: Date.now(),
    };
    const ledger: ChatTurnLedger = new Map([
      [
        "turn-err",
        {
          turnId: "turn-err",
          runId: "r1",
          request: snap,
          userMessageId: "u1",
          status: "failed",
          startedAt: Date.now(),
        },
      ],
    ]);
    const plan = planRetryTurn(ledger, "turn-err");
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.snapshot.turnId).toBe("turn-err");
    expect(planRetryTurn(ledger, "missing").ok).toBe(false);
  });
});
