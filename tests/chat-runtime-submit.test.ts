import { describe, expect, it } from "vitest";
import type { ChatSubmitInput } from "../src/shared/chat-runtime/chat-runtime-contract";
import { historyForSubmit } from "../src/renderer/src/modules/chat/controller/chatHistoryMapper";

describe("chat-runtime submit payload shape", () => {
  it("requires history for multi-turn submit", () => {
    const history = historyForSubmit([
      { id: "1", kind: "user", content: "round 1" },
      { id: "2", kind: "assistant", content: "answer 1" },
      { id: "3", kind: "user", content: "round 2" },
      { id: "4", kind: "assistant", content: "", pending: true },
    ]);
    const input: ChatSubmitInput = {
      runId: "run-1",
      profileId: "default",
      sessionId: "sess-1",
      message: "round 2",
      history,
      invocationSource: "default_chat",
      permissionMode: "default",
      workMode: "ask",
    };
    expect(input.history).toEqual([
      { role: "user", content: "round 1" },
      { role: "assistant", content: "answer 1" },
      { role: "user", content: "round 2" },
    ]);
    expect(input.sessionId).toBe("sess-1");
    expect(input.permissionMode).not.toBe(input.workMode);
  });
});
