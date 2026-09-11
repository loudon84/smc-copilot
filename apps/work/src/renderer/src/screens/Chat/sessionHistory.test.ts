import { describe, expect, it } from "vitest";
import { dbItemsToChatMessages, type DbHistoryItem } from "./sessionHistory";
import { skillRunNativeAssistantMessageId, skillRunNativeUserMessageId } from "../../../../shared/skill-run";

describe("dbItemsToChatMessages Native Skill Run mapping", () => {
  it("maps sidecar Native rows with platformMessageId and omits Prompt", () => {
    const items: DbHistoryItem[] = [
      {
        kind: "user",
        id: 1,
        content: "full user text",
        timestamp: 1_700_000_000,
        platformMessageId: skillRunNativeUserMessageId("req-1"),
      },
      {
        kind: "reasoning",
        id: -1,
        text: "thinking",
        platformMessageId: "skill-run:req-1:activity:evt-1",
      },
      {
        kind: "assistant",
        id: 2,
        content: "done",
        timestamp: 1_700_000_001,
        platformMessageId: skillRunNativeAssistantMessageId("req-1"),
      },
    ];
    const mapped = dbItemsToChatMessages(items);
    expect(mapped.map((row) => row.id)).toEqual([
      skillRunNativeUserMessageId("req-1"),
      "skill-run:req-1:activity:evt-1",
      skillRunNativeAssistantMessageId("req-1"),
    ]);
    expect(mapped[2]).toMatchObject({
      role: "agent",
      content: "done",
    });
    expect(JSON.stringify(mapped)).not.toMatch(/prompt/i);
  });

  it("keeps legacy bubbles and does not invent a skill_run card for incomplete Native assistants", () => {
    const mapped = dbItemsToChatMessages([
      { kind: "user", id: 1, content: "hello", timestamp: 1 },
      { kind: "assistant", id: 2, content: "legacy answer", timestamp: 2 },
      {
        kind: "assistant",
        id: 3,
        content: "",
        error: "still running",
        timestamp: 3,
        platformMessageId: skillRunNativeAssistantMessageId("req-live"),
      },
    ]);
    expect(mapped.map((row) => ("kind" in row ? row.kind : row.role))).toEqual([
      "user",
      "agent",
      "agent",
    ]);
    expect(mapped[2]).toMatchObject({
      id: skillRunNativeAssistantMessageId("req-live"),
      error: "still running",
    });
    expect(mapped.some((row) => "kind" in row && row.kind === "clarify")).toBe(
      false,
    );
  });
});
