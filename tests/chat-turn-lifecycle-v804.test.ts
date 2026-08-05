import { describe, expect, it } from "vitest";
import {
  chatReducer,
  createInitialChatState,
  canHydrateSession,
  isBusyRunState,
} from "../src/renderer/src/modules/chat/controller/chatReducer";
import { chatRuntimeEventToActions } from "../src/renderer/src/modules/chat/controller/chatRuntimeEventReducer";
import type { ChatRuntimeEvent } from "../src/shared/chat-runtime/chat-runtime-events";
import {
  CHAT_TURN_NON_TERMINAL_EVENTS,
  isChatTurnTerminalEventType,
} from "../src/shared/chat-runtime/chat-runtime-events";

describe("first-turn session hydrate vs bind", () => {
  it("BIND_SESSION only updates activeSessionId without resetting runState", () => {
    let state = createInitialChatState("run-1");
    state = chatReducer(state, { type: "BEGIN_TURN", turnId: "turn-1" });
    state = chatReducer(state, {
      type: "APPEND_MESSAGES",
      messages: [
        { id: "u1", kind: "user", content: "hi" },
        { id: "a1", kind: "assistant", content: "hello", pending: true },
      ],
    });
    state = chatReducer(state, {
      type: "UPSERT_STREAMING_ASSISTANT",
      id: "a1",
      content: "hello world",
      append: false,
    });

    state = chatReducer(state, {
      type: "BIND_SESSION",
      sessionId: "sess-new",
    });

    expect(state.activeSessionId).toBe("sess-new");
    expect(state.runState).toBe("streaming");
    expect(state.messages).toHaveLength(2);
    expect(
      state.messages.find((m) => m.kind === "assistant" && m.id === "a1"),
    ).toMatchObject({ content: "hello world", pending: true });
  });

  it("session.started maps to BIND_SESSION not LOAD_HISTORY", () => {
    const event: ChatRuntimeEvent = {
      type: "session.started",
      runId: "run-1",
      turnId: "turn-1",
      sessionId: "sess-1",
    };
    const actions = chatRuntimeEventToActions(event, null);
    expect(actions).toEqual([{ type: "BIND_SESSION", sessionId: "sess-1" }]);
  });

  it("HYDRATE_SESSION is rejected while busy", () => {
    let state = createInitialChatState("run-1");
    state = chatReducer(state, { type: "BEGIN_TURN", turnId: "turn-1" });
    expect(isBusyRunState(state.runState)).toBe(true);
    expect(canHydrateSession(state)).toBe(false);

    const next = chatReducer(state, {
      type: "HYDRATE_SESSION",
      sessionId: "late-sess",
      messages: [{ id: "h1", kind: "user", content: "old" }],
    });
    expect(next).toBe(state);
    expect(next.activeSessionId).toBeNull();
  });

  it("LOAD_HISTORY is a no-op while busy (late hydrate race)", () => {
    let state = createInitialChatState("run-1");
    state = chatReducer(state, { type: "BEGIN_TURN", turnId: "turn-1" });
    state = chatReducer(state, {
      type: "APPEND_MESSAGES",
      messages: [{ id: "u1", kind: "user", content: "live" }],
    });

    const next = chatReducer(state, {
      type: "LOAD_HISTORY",
      sessionId: "sess-forced",
      messages: [],
    });
    expect(next.runState).toBe("streaming");
    expect(next.messages).toHaveLength(1);
    expect(next.activeSessionId).toBeNull();
  });

  it("HYDRATE_SESSION works when idle with empty messages", () => {
    const state = createInitialChatState("run-1");
    expect(canHydrateSession(state)).toBe(true);
    const next = chatReducer(state, {
      type: "HYDRATE_SESSION",
      sessionId: "sess-1",
      messages: [{ id: "u1", kind: "user", content: "restored" }],
    });
    expect(next.activeSessionId).toBe("sess-1");
    expect(next.messages).toHaveLength(1);
    expect(next.runState).toBe("idle");
  });

  it("COMPLETE_STREAM after BIND keeps completed and messages", () => {
    let state = createInitialChatState("run-1");
    state = chatReducer(state, { type: "BEGIN_TURN", turnId: "turn-1" });
    state = chatReducer(state, {
      type: "APPEND_MESSAGES",
      messages: [
        { id: "u1", kind: "user", content: "hi" },
        { id: "a1", kind: "assistant", content: "answer", pending: true },
      ],
    });
    state = chatReducer(state, {
      type: "BIND_SESSION",
      sessionId: "sess-1",
    });
    state = chatReducer(state, {
      type: "COMPLETE_STREAM",
      sessionId: "sess-1",
    });
    expect(state.runState).toBe("completed");
    expect(state.messages[1]).toMatchObject({
      kind: "assistant",
      content: "answer",
      pending: false,
    });

    // Late LOAD_HISTORY must not wipe completed transcript when not busy
    // (busy guard only). Completed is not busy — explicit hydrate with
    // messages already present is rejected by canHydrateSession.
    expect(canHydrateSession(state)).toBe(false);
  });
});

describe("turn terminal event guard", () => {
  it("classifies terminal vs non-terminal event types", () => {
    expect(isChatTurnTerminalEventType("completed")).toBe(true);
    expect(isChatTurnTerminalEventType("failed")).toBe(true);
    expect(CHAT_TURN_NON_TERMINAL_EVENTS.has("message.delta")).toBe(true);
    expect(CHAT_TURN_NON_TERMINAL_EVENTS.has("session.started")).toBe(true);
  });

  it("drops streaming mutations after COMPLETE_STREAM", () => {
    let state = createInitialChatState("run-1");
    state = chatReducer(state, { type: "BEGIN_TURN", turnId: "turn-1" });
    state = chatReducer(state, {
      type: "UPSERT_STREAMING_ASSISTANT",
      id: "a1",
      content: "done",
      append: false,
    });
    state = chatReducer(state, { type: "COMPLETE_STREAM" });

    const late = chatReducer(state, {
      type: "UPSERT_STREAMING_ASSISTANT",
      id: "a1",
      content: " LATE",
      append: true,
    });
    expect(late).toBe(state);
    expect(late.runState).toBe("completed");
    expect(late.messages[0]).toMatchObject({ content: "done", pending: false });

    const lateTool = chatReducer(state, {
      type: "SET_TOOL_PROGRESS",
      tool: "ghost",
    });
    expect(lateTool.toolProgress).toBeNull();

    const lateBusy = chatReducer(state, {
      type: "SET_RUN_STATE",
      runState: "streaming",
    });
    expect(lateBusy.runState).toBe("completed");
  });

  it("BEGIN_TURN resets per-turn usage", () => {
    let state = createInitialChatState("run-1");
    state = chatReducer(state, {
      type: "SET_USAGE",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });
    // SET_USAGE while idle is allowed (not terminal)
    expect(state.usage?.totalTokens).toBe(15);

    state = chatReducer(state, { type: "BEGIN_TURN", turnId: "turn-2" });
    expect(state.activeTurnId).toBe("turn-2");
    expect(state.usage).toBeNull();
    expect(state.cumulativeUsage?.totalTokens).toBe(15);
  });
});
