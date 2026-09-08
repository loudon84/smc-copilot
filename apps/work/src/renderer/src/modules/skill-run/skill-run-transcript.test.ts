import { describe, expect, it } from "vitest";
import {
  applySkillRunProjectionsToMessages,
  compactSkillRunActivities,
  createOptimisticSkillRunTurn,
  rejectSkillRunCard,
  skillRunCardMessageId,
} from "./skill-run-transcript";
import type { SkillRunProjection } from "../../../../shared/skill-run";

function projection(
  overrides: Partial<SkillRunProjection> = {},
): SkillRunProjection {
  return {
    clientRequestId: "req-1",
    providerRunId: "task-1",
    toolName: "writer",
    promptSummary: "summary",
    sessionId: "session-1",
    profileId: "default",
    phase: "running",
    displayStage: "Executing skill...",
    lastEventId: "evt-1",
    eventSeq: 1,
    createdAt: "t0",
    updatedAt: "t1",
    ...overrides,
  };
}

describe("skill-run-transcript adapter", () => {
  it("creates one user and one pending card before Main returns", () => {
    const [user, card] = createOptimisticSkillRunTurn({
      prompt: "Please write a report",
      clientRequestId: "req-1",
      toolName: "writer",
    });
    expect(user).toMatchObject({
      role: "user",
      content: "Please write a report",
    });
    expect(card).toMatchObject({
      kind: "skill_run",
      clientRequestId: "req-1",
      phase: "pending-submit",
      pending: true,
    });
  });

  it("patches the same request card on reject and upserts live A/A/B as three cards", () => {
    const optimistic = createOptimisticSkillRunTurn({
      prompt: "one",
      clientRequestId: "req-1",
      toolName: "writer",
    });
    const rejected = rejectSkillRunCard(optimistic, "req-1", "denied");
    expect(rejected).toHaveLength(2);
    expect(rejected[1]).toMatchObject({
      id: skillRunCardMessageId("req-1"),
      phase: "failed",
      errorMessage: "denied",
      pending: false,
    });

    const live = applySkillRunProjectionsToMessages([], [
      projection({ clientRequestId: "req-a1" }),
      projection({ clientRequestId: "req-a2" }),
      projection({ clientRequestId: "req-b", toolName: "other" }),
    ]);
    expect(
      live.map((item) =>
        "kind" in item && item.kind === "skill_run" ? item.clientRequestId : "",
      ),
    ).toEqual(["req-a1", "req-a2", "req-b"]);
  });

  it("keeps live and history cards on clientRequestId, never prompt text", () => {
    const history = createOptimisticSkillRunTurn({
      prompt: "same prompt text",
      clientRequestId: "req-history",
      toolName: "writer",
    });
    const second = createOptimisticSkillRunTurn({
      prompt: "same prompt text",
      clientRequestId: "req-live",
      toolName: "writer",
    });
    const merged = applySkillRunProjectionsToMessages(
      [...history, ...second],
      [
        projection({
          clientRequestId: "req-history",
          phase: "succeeded",
          text: "done",
        }),
      ],
    );
    const cards = merged.filter(
      (item) => "kind" in item && item.kind === "skill_run",
    );
    expect(cards).toHaveLength(2);
    expect(cards.map((item) => item.clientRequestId)).toEqual([
      "req-history",
      "req-live",
    ]);
  });

  it("dedupes event ids and compacts tool status by callId", () => {
    const compacted = compactSkillRunActivities([
      { eventId: "evt-1", kind: "reasoning.summary", summary: "a" },
      { eventId: "evt-1", kind: "reasoning.summary", summary: "dup" },
      {
        eventId: "evt-2",
        kind: "tool.call",
        callId: "call-1",
        toolName: "search",
        status: "started",
      },
      {
        eventId: "evt-3",
        kind: "tool.call",
        callId: "call-1",
        toolName: "search",
        status: "completed",
      },
    ]);
    expect(compacted).toHaveLength(2);
    expect(compacted[1]).toMatchObject({ status: "completed", callId: "call-1" });
  });
});
