import { describe, expect, it } from "vitest";
import {
  chatReducer,
  createInitialChatState,
} from "../src/renderer/src/modules/chat/controller/chatReducer";
import {
  historyForSubmit,
  sessionMessagesToViewItems,
  viewItemsToHistory,
} from "../src/renderer/src/modules/chat/controller/chatHistoryMapper";
import { chatRuntimeEventToActions } from "../src/renderer/src/modules/chat/controller/chatRuntimeEventReducer";

describe("chat controller — multi-turn session / history", () => {
  it("maps session messages and builds history without pending assistants", () => {
    const items = sessionMessagesToViewItems([
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello" },
    ]);
    expect(viewItemsToHistory(items)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    const withPending = [
      ...items,
      { id: "3", kind: "assistant" as const, content: "", pending: true },
    ];
    expect(historyForSubmit(withPending)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("session.started sets activeSessionId; second turn resumes same id", () => {
    let state = createInitialChatState("run-1");
    state = chatReducer(state, {
      type: "APPEND_MESSAGES",
      messages: [
        { id: "u1", kind: "user", content: "one" },
        { id: "a1", kind: "assistant", content: "", pending: true },
      ],
    });
    for (const action of chatRuntimeEventToActions(
      { type: "session.started", runId: "run-1", sessionId: "sess-abc" },
      "a1",
    )) {
      state = chatReducer(state, action);
    }
    expect(state.activeSessionId).toBe("sess-abc");

    for (const action of chatRuntimeEventToActions(
      { type: "completed", runId: "run-1", sessionId: "sess-abc" },
      "a1",
    )) {
      state = chatReducer(state, action);
    }
    expect(state.activeSessionId).toBe("sess-abc");
    expect(state.runState).toBe("completed");

    // Round 2 — history includes turn 1; session stays
    state = chatReducer(state, {
      type: "APPEND_MESSAGES",
      messages: [
        { id: "u2", kind: "user", content: "two" },
        { id: "a2", kind: "assistant", content: "", pending: true },
      ],
    });
    const history = historyForSubmit(state.messages);
    expect(history.some((h) => h.content === "one")).toBe(true);
    expect(state.activeSessionId).toBe("sess-abc");
  });

  it("cancel keeps partial assistant content", () => {
    let state = createInitialChatState("run-x");
    state = chatReducer(state, {
      type: "UPSERT_STREAMING_ASSISTANT",
      id: "a1",
      content: "partial…",
      append: false,
    });
    state = chatReducer(state, { type: "CANCEL" });
    expect(state.runState).toBe("cancelled");
    const assistant = state.messages.find((m) => m.kind === "assistant");
    expect(assistant && assistant.kind === "assistant" && assistant.content).toBe(
      "partial…",
    );
    expect(assistant && "pending" in assistant && assistant.pending).toBe(false);
  });
});
