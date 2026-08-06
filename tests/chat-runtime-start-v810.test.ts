import { describe, expect, it, beforeEach } from "vitest";
import type {
  ChatStartInput,
  ChatStartResult,
} from "../src/shared/chat-runtime/chat-runtime-contract";
import {
  CHAT_RUNTIME_CHANNELS,
  submitInputToStartInput,
} from "../src/shared/chat-runtime/chat-runtime-contract";
import {
  stampChatRuntimeEvent,
  getTurnLastSequence,
  __resetChatEventSequencerForTests,
} from "../src/main/chat-runtime/chat-event-sequencer";
import { isChatRuntimeEvent } from "../src/shared/chat-runtime/chat-runtime-events";

describe("chat-runtime start contract (v8.1)", () => {
  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Start returns accepted shape]]
  it("exposes start/state/recover channels", () => {
    expect(CHAT_RUNTIME_CHANNELS.start).toBe("chat-runtime:start");
    expect(CHAT_RUNTIME_CHANNELS.state).toBe("chat-runtime:get-state");
    expect(CHAT_RUNTIME_CHANNELS.recover).toBe("chat-runtime:recover");
    expect(CHAT_RUNTIME_CHANNELS.submit).toBe("chat-runtime:submit");
  });

  it("ChatStartResult accepted shape returns immediately semantics", () => {
    const ok: ChatStartResult = {
      ok: true,
      runId: "run-1",
      turnId: "turn-1",
      acceptedAt: 1000,
    };
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.acceptedAt).toBe(1000);
      // No response field — events carry the payload.
      expect("response" in ok).toBe(false);
    }
  });

  it("submitInputToStartInput maps compatibility adapter", () => {
    const start: ChatStartInput = submitInputToStartInput({
      runId: "r1",
      turnId: "t1",
      profileId: "default",
      message: "hello",
      history: [],
      invocationSource: "default_chat",
    });
    expect(start.runId).toBe("r1");
    expect(start.turnId).toBe("t1");
    expect(start.request.message).toBe("hello");
    expect(start.request.profileId).toBe("default");
  });
});

describe("chat-event-sequencer (v8.1)", () => {
  beforeEach(() => {
    __resetChatEventSequencerForTests();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Sequencer assigns monotonic event ids]]
  it("assigns monotonic sequence and unique eventId per turn", () => {
    const e1 = stampChatRuntimeEvent({
      type: "message.delta",
      runId: "run-a",
      turnId: "turn-1",
      content: "a",
    });
    const e2 = stampChatRuntimeEvent({
      type: "message.delta",
      runId: "run-a",
      turnId: "turn-1",
      content: "b",
    });
    expect(e1.sequence).toBe(1);
    expect(e2.sequence).toBe(2);
    expect(e1.eventId).not.toBe(e2.eventId);
    expect(e1.emittedAt).toBeTypeOf("number");
    expect(isChatRuntimeEvent(e1)).toBe(true);
    expect(getTurnLastSequence("run-a", "turn-1")).toBe(2);
  });

  it("isolates sequence counters across turns", () => {
    stampChatRuntimeEvent({
      type: "message.delta",
      runId: "run-a",
      turnId: "turn-1",
      content: "a",
    });
    const other = stampChatRuntimeEvent({
      type: "message.delta",
      runId: "run-a",
      turnId: "turn-2",
      content: "b",
    });
    expect(other.sequence).toBe(1);
  });
});
