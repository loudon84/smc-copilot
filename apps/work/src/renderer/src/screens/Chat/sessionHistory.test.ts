import { describe, expect, it } from "vitest";
import { dbItemsToChatMessages, type DbHistoryItem } from "./sessionHistory";

describe("dbItemsToChatMessages skill_run mapping", () => {
  it("maps a sidecar history item to the Skill Chat variant without Prompt", () => {
    const item: DbHistoryItem = {
      kind: "skill_run",
      id: -1,
      clientRequestId: "req-1",
      providerRunId: "task-1",
      toolName: "writer",
      phase: "succeeded",
      displayStage: "Skill completed",
      activities: [
        { eventId: "evt-1", kind: "reasoning.summary", summary: "thinking" },
      ],
      resultText: "done",
      timestamp: 1_700_000_000,
      auditComplete: true,
    };
    const mapped = dbItemsToChatMessages([item]);
    expect(mapped).toEqual([
      expect.objectContaining({
        id: "skill-run:req-1",
        kind: "skill_run",
        role: "agent",
        clientRequestId: "req-1",
        toolName: "writer",
        pending: false,
        resultText: "done",
      }),
    ]);
    expect(JSON.stringify(mapped)).not.toMatch(/prompt/i);
  });

  it("keeps legacy bubbles and marks incomplete runs pending when not terminal", () => {
    const mapped = dbItemsToChatMessages([
      { kind: "user", id: 1, content: "hello", timestamp: 1 },
      { kind: "assistant", id: 2, content: "legacy answer", timestamp: 2 },
      {
        kind: "skill_run",
        id: -2,
        clientRequestId: "req-live",
        toolName: "writer",
        phase: "running",
        displayStage: "Executing skill...",
        activities: [],
        auditComplete: false,
      },
    ]);
    expect(mapped.map((row) => ("kind" in row ? row.kind : row.role))).toEqual([
      "user",
      "agent",
      "skill_run",
    ]);
    expect(mapped[2]).toMatchObject({
      kind: "skill_run",
      pending: true,
      auditComplete: false,
    });
  });
});
