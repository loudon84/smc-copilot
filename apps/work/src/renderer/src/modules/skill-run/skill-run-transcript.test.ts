import { describe, expect, it } from "vitest";
import {
  applySkillRunProjectionsToMessages,
  compactSkillRunActivities,
  createOptimisticSkillRunTurn,
  rejectSkillRunCard,
  skillRunUserMessageId,
} from "./skill-run-transcript";
import type { SkillRunProjection } from "../../../../shared/skill-run";
import { skillRunNativeAssistantMessageId } from "../../../../shared/skill-run";

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
  it("creates Native user and pending assistant anchors without a card", () => {
    const [user, assistant] = createOptimisticSkillRunTurn({
      prompt: "Please write a report",
      clientRequestId: "req-1",
      toolName: "writer",
    });
    expect(user).toMatchObject({
      id: skillRunUserMessageId("req-1"),
      role: "user",
      content: "Please write a report",
    });
    expect(assistant).toMatchObject({
      id: skillRunNativeAssistantMessageId("req-1"),
      role: "agent",
      pending: true,
    });
    expect(assistant).not.toMatchObject({ kind: "skill_run" });
  });

  it("rejects onto the Native assistant row and never fabricates a normal-path card", () => {
    const optimistic = createOptimisticSkillRunTurn({
      prompt: "one",
      clientRequestId: "req-1",
      toolName: "writer",
    });
    const rejected = rejectSkillRunCard(optimistic, "req-1", "denied");
    expect(rejected).toHaveLength(2);
    expect(rejected[1]).toMatchObject({
      id: skillRunNativeAssistantMessageId("req-1"),
      error: "denied",
      pending: false,
    });
    expect(rejected.some((item) => "kind" in item && item.kind === "skill_run")).toBe(
      false,
    );

    const live = applySkillRunProjectionsToMessages([], [
      projection({ clientRequestId: "req-a1" }),
      projection({ clientRequestId: "req-a2" }),
      projection({ clientRequestId: "req-b", toolName: "other" }),
    ]);
    expect(live.some((item) => "kind" in item && item.kind === "skill_run")).toBe(
      false,
    );
    expect(
      live.filter((item) => item.role === "user").map((item) => item.id),
    ).toEqual([
      skillRunUserMessageId("req-a1"),
      skillRunUserMessageId("req-a2"),
      skillRunUserMessageId("req-b"),
    ]);
  });

  it("keeps live and history Native turns on clientRequestId, never prompt text", () => {
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
    expect(merged.some((item) => "kind" in item && item.kind === "skill_run")).toBe(
      false,
    );
    expect(
      merged.filter((item) => item.role === "user").map((item) => item.id),
    ).toEqual([
      skillRunUserMessageId("req-history"),
      skillRunUserMessageId("req-live"),
    ]);
    expect(
      merged.find((item) => item.id === skillRunNativeAssistantMessageId("req-history")),
    ).toMatchObject({ content: "done", pending: false });
  });

  it("maps Native identities, patches one tool row, and uses a read-only notice", () => {
    const compacted = compactSkillRunActivities([
      { eventId: "evt-1", kind: "reasoning.summary", summary: "a", ordinal: 1 },
      { eventId: "evt-1", kind: "reasoning.summary", summary: "dup", ordinal: 1 },
      {
        eventId: "evt-2",
        kind: "tool.call",
        callId: "call-1",
        toolName: "search",
        status: "started",
        ordinal: 2,
      },
      {
        eventId: "evt-3",
        kind: "tool.call",
        callId: "call-1",
        toolName: "search",
        status: "completed",
        ordinal: 3,
      },
    ]);
    expect(compacted).toHaveLength(2);
    expect(compacted[1]).toMatchObject({ status: "completed", callId: "call-1" });

    const live = applySkillRunProjectionsToMessages(
      createOptimisticSkillRunTurn({
        prompt: "search now",
        clientRequestId: "req-1",
        toolName: "writer",
      }),
      [
        projection({
          phase: "succeeded",
          text: "found it",
          activities: [
            {
              eventId: "evt-1",
              kind: "reasoning.summary",
              summary: "think",
              ordinal: 1,
            },
            {
              eventId: "evt-2",
              kind: "tool.call",
              callId: "call-1",
              toolName: "search",
              status: "started",
              ordinal: 2,
            },
            {
              eventId: "evt-3",
              kind: "tool.call",
              callId: "call-1",
              toolName: "search",
              status: "completed",
              ordinal: 3,
            },
            {
              eventId: "evt-4",
              kind: "clarify.requested",
              question: "which file?",
              ordinal: 4,
            },
          ],
        }),
      ],
    );
    expect(live.map((item) => item.kind ?? item.role)).toEqual([
      "user",
      "reasoning",
      "tool_call",
      "assistant",
      "assistant",
    ]);
    const tool = live.find((item) => "kind" in item && item.kind === "tool_call");
    expect(tool).toMatchObject({
      id: "skill-run:req-1:tool:call-1",
      status: "completed",
      args: "",
    });
    expect(live.some((item) => "kind" in item && item.kind === "clarify")).toBe(
      false,
    );
    expect(live.some((item) => "kind" in item && item.kind === "tool_result")).toBe(
      false,
    );
    expect(JSON.stringify(live)).not.toContain("arguments");
    expect(
      live.find((item) => item.id === "skill-run:req-1:activity:evt-4"),
    ).toMatchObject({
      kind: "assistant",
      content: "which file?",
    });
  });

  it("keeps a rollback skill_run card when reject finds one", () => {
    const rejected = rejectSkillRunCard(
      [
        {
          id: "skill-run:req-roll",
          kind: "skill_run",
          role: "agent",
          clientRequestId: "req-roll",
          toolName: "writer",
          phase: "pending-submit",
          displayStage: "Submitting skill request...",
          activities: [],
          pending: true,
        },
      ],
      "req-roll",
      "denied",
    );
    expect(rejected[0]).toMatchObject({
      kind: "skill_run",
      phase: "failed",
      errorMessage: "denied",
    });
  });
});
