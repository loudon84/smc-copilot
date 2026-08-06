import { describe, expect, it, beforeEach } from "vitest";
import {
  createEmptyTurnLedger,
  upsertTurnRecord,
} from "../src/renderer/src/modules/chat/controller/chatTurnLedger";
import {
  planEditAndRetry,
  planRetryTurn,
  planRetryWithCurrentContext,
} from "../src/renderer/src/modules/chat/controller/chatRetryService";
import { createTurnSnapshot } from "../src/renderer/src/modules/chat/controller/chatTurnSnapshot";
import {
  queueReducer,
  type QueueState,
} from "../src/renderer/src/modules/chat/hooks/useChatQueue";

function snap(turnId: string, text: string, expertId?: string) {
  return createTurnSnapshot({
    turnId,
    rawText: text,
    effectiveText: text,
    attachments: [],
    sessionId: null,
    profileId: "default",
    modelId: "model-a",
    expertId,
    invocationSource: "default_chat",
  });
}

describe("turn ledger retry (v8.1)", () => {
  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Retry binds exact turnId]]
  it("binds retry to specific turnId and skips user append", () => {
    let ledger = createEmptyTurnLedger();
    ledger = upsertTurnRecord(ledger, {
      turnId: "turn-a",
      runId: "run-1",
      request: snap("turn-a", "first", "expert-1"),
      userMessageId: "u-a",
      status: "failed",
      startedAt: 1,
    });
    ledger = upsertTurnRecord(ledger, {
      turnId: "turn-b",
      runId: "run-1",
      request: snap("turn-b", "second", "expert-2"),
      userMessageId: "u-b",
      status: "failed",
      startedAt: 2,
    });

    const planA = planRetryTurn(ledger, "turn-a");
    expect(planA.ok).toBe(true);
    if (planA.ok) {
      expect(planA.snapshot.rawText).toBe("first");
      expect(planA.snapshot.expertId).toBe("expert-1");
      expect(planA.skipAppendUser).toBe(true);
    }

    const planB = planRetryTurn(ledger, "turn-b");
    expect(planB.ok).toBe(true);
    if (planB.ok) {
      expect(planB.snapshot.rawText).toBe("second");
      expect(planB.snapshot.expertId).toBe("expert-2");
    }
  });

  it("edit-and-retry restores full work context", () => {
    let ledger = createEmptyTurnLedger();
    ledger = upsertTurnRecord(ledger, {
      turnId: "turn-1",
      runId: "run-1",
      request: {
        ...snap("turn-1", "edit me", "ex-9"),
        teamId: "team-1",
        skillName: "skill-x",
        workMode: "craft",
        permissionMode: "ask_each_time",
        promptHintMode: "custom",
      },
      userMessageId: "u1",
      status: "failed",
      startedAt: 1,
    });
    const plan = planEditAndRetry(ledger, "turn-1");
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.contextRestore).toMatchObject({
        expertId: "ex-9",
        teamId: "team-1",
        skillName: "skill-x",
        workMode: "craft",
        permissionMode: "ask_each_time",
        promptHintMode: "custom",
      });
    }
  });

  it("retry with current context overrides model/expert", () => {
    let ledger = createEmptyTurnLedger();
    ledger = upsertTurnRecord(ledger, {
      turnId: "turn-1",
      runId: "run-1",
      request: snap("turn-1", "keep text", "old-expert"),
      userMessageId: "u1",
      status: "failed",
      startedAt: 1,
    });
    const plan = planRetryWithCurrentContext(ledger, "turn-1", {
      expertId: "new-expert",
      modelId: "model-b",
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.snapshot.rawText).toBe("keep text");
      expect(plan.snapshot.expertId).toBe("new-expert");
      expect(plan.snapshot.modelId).toBe("model-b");
      expect(plan.skipAppendUser).toBe(true);
    }
  });
});

describe("queue reducer (v8.1)", () => {
  const empty: QueueState = { entries: [], autoDrain: true };

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Queue reducer is atomic]]
  it("enqueue then peek queued then mark_running atomically", () => {
    let state = queueReducer(empty, {
      type: "enqueue",
      entry: {
        id: "q-1",
        snapshot: snap("queued-1", "hello"),
        enqueuedAt: 1,
        status: "queued",
      },
    });
    expect(state.entries).toHaveLength(1);
    state = queueReducer(state, { type: "mark_running", queueId: "q-1" });
    expect(state.entries[0].status).toBe("running");
    state = queueReducer(state, { type: "complete", queueId: "q-1" });
    expect(state.entries).toHaveLength(0);
  });

  it("supports move / remove / pause auto-drain", () => {
    let state = queueReducer(empty, {
      type: "enqueue",
      entry: {
        id: "q-1",
        snapshot: snap("q1", "a"),
        enqueuedAt: 1,
        status: "queued",
      },
    });
    state = queueReducer(state, {
      type: "enqueue",
      entry: {
        id: "q-2",
        snapshot: snap("q2", "b"),
        enqueuedAt: 2,
        status: "queued",
      },
    });
    state = queueReducer(state, { type: "move", from: 1, to: 0 });
    expect(state.entries.map((e) => e.id)).toEqual(["q-2", "q-1"]);
    state = queueReducer(state, { type: "remove", queueId: "q-2" });
    expect(state.entries).toHaveLength(1);
    state = queueReducer(state, { type: "set_auto_drain", enabled: false });
    expect(state.autoDrain).toBe(false);
  });
});
