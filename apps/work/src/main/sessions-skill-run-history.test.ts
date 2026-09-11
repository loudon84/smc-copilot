import { describe, expect, it, vi } from "vitest";
import type { SkillRunContinuationItem } from "../shared/skill-run";
import type { HistoryItem } from "./sessions";
import { mergeSkillRunTranscriptIntoHistory } from "./sessions";
import { skillRunTranscriptBubbleIds } from "./skill-run/skill-run-session-materialize";
import type { SkillRunDurableActivityRecord } from "./skill-run/skill-run-service";
import type { SkillRunTranscriptRunRow } from "./skill-run/skill-run-transcript-store";

const deleteSkillRunTranscriptForSession = vi.hoisted(() => vi.fn());

vi.mock("./skill-run/skill-run-transcript-store", () => ({
  deleteSkillRunTranscriptForSession,
  listSkillRunTranscriptForSession: () => ({ runs: [], activities: [] }),
}));

function run(
  overrides: Partial<SkillRunTranscriptRunRow> = {},
): SkillRunTranscriptRunRow {
  return {
    clientRequestId: "req-a",
    sessionId: "session-1",
    profileId: "default",
    toolName: "writer",
    prompt: "full prompt must not appear on HistoryItem",
    providerRunId: "task-1",
    phase: "succeeded",
    displayStage: "Skill completed",
    lastEventId: "evt-1",
    eventSeq: 1,
    text: "done",
    createdAt: "2026-01-01T00:00:02.000Z",
    updatedAt: "2026-01-01T00:00:03.000Z",
    auditComplete: true,
    ...overrides,
  };
}

function activity(
  overrides: Partial<SkillRunDurableActivityRecord> = {},
): SkillRunDurableActivityRecord {
  return {
    clientRequestId: "req-a",
    sessionId: "session-1",
    eventId: "evt-1",
    kind: "reasoning.summary",
    ordinal: 0,
    ...overrides,
  };
}

function userItem(
  requestId: string,
  timestamp = 1_700_000_000,
): HistoryItem {
  return {
    kind: "user",
    id: 1,
    content: "full user prompt text",
    timestamp,
    platformMessageId: skillRunTranscriptBubbleIds(requestId).user,
  };
}

function assistantFallback(
  requestId: string,
  timestamp = 1_700_000_001,
): HistoryItem {
  return {
    kind: "assistant",
    id: 2,
    content: "[Skill completed successfully: writer]",
    timestamp,
    platformMessageId: skillRunTranscriptBubbleIds(requestId).assistant,
  };
}

describe("mergeSkillRunTranscriptIntoHistory", () => {
  it("replaces the deterministic assistant fallback, keeps the user row, and omits Prompt", () => {
    const legacy: HistoryItem = {
      kind: "assistant",
      id: 9,
      content: "[Skill completed successfully: writer]",
      timestamp: 1_700_000_050,
    };
    const merged = mergeSkillRunTranscriptIntoHistory(
      [userItem("req-a"), assistantFallback("req-a"), legacy],
      {
        runs: [run()],
        activities: [activity()],
      },
    );
    expect(merged.filter((item) => item.kind === "user")).toHaveLength(1);
    expect(
      merged.find(
        (item) =>
          item.kind === "assistant" &&
          item.platformMessageId ===
            skillRunTranscriptBubbleIds("req-a").assistant,
      ),
    ).toMatchObject({ content: "done" });
    expect(merged.filter((item) => item.kind === "assistant")).toEqual([
      expect.objectContaining({
        platformMessageId: skillRunTranscriptBubbleIds("req-a").assistant,
        content: "done",
      }),
      legacy,
    ]);
    expect(merged.filter((item) => item.kind === "skill_run")).toHaveLength(0);
    expect(merged.map((item) => item.kind)).toEqual([
      "user",
      "reasoning",
      "assistant",
      "assistant",
    ]);
    expect(JSON.stringify(merged)).not.toMatch(/full prompt must not appear/);
  });

  it("keeps A/A/B as distinct Native turns and 100 ordered activities on one request", () => {
    const activities = Array.from({ length: 100 }, (_, index) =>
      activity({
        eventId: `evt-${index}`,
        ordinal: index,
        summary: `step ${index}`,
      }),
    );
    const merged = mergeSkillRunTranscriptIntoHistory(
      [
        userItem("req-a1", 10),
        userItem("req-a2", 20),
        userItem("req-b", 30),
      ],
      {
        runs: [
          run({ clientRequestId: "req-a1", createdAt: "2026-01-01T00:00:10.000Z" }),
          run({ clientRequestId: "req-a2", createdAt: "2026-01-01T00:00:20.000Z" }),
          run({
            clientRequestId: "req-b",
            toolName: "other",
            createdAt: "2026-01-01T00:00:30.000Z",
          }),
        ],
        activities: activities.map((row) => ({
          ...row,
          clientRequestId: "req-a1",
        })),
      },
    );
    const users = merged.filter((item) => item.kind === "user");
    expect(
      users.map((item) =>
        item.kind === "user" ? item.platformMessageId : "",
      ),
    ).toEqual([
      skillRunTranscriptBubbleIds("req-a1").user,
      skillRunTranscriptBubbleIds("req-a2").user,
      skillRunTranscriptBubbleIds("req-b").user,
    ]);
    expect(merged.filter((item) => item.kind === "skill_run")).toHaveLength(0);
    const reasoning = merged.filter((item) => item.kind === "reasoning");
    expect(reasoning).toHaveLength(100);
    expect(reasoning[99]).toMatchObject({ text: "step 99" });
  });

  it("drops continuation when sidecar exists and keeps one non-terminal continuation otherwise", () => {
    const continuation: SkillRunContinuationItem = {
      kind: "skill-run",
      schemaVersion: 1,
      clientRequestId: "req-live",
      providerRunId: "task-live",
      toolName: "writer",
      promptSummary: "summary only",
      sessionId: "session-1",
      profileId: "default",
      lastEventId: "evt-1",
      phase: "running",
      updatedAt: "2026-01-01T00:00:40.000Z",
    };
    const withSidecar = mergeSkillRunTranscriptIntoHistory(
      [],
      { runs: [run({ clientRequestId: "req-live", phase: "running" })], activities: [] },
      [continuation],
    );
    expect(withSidecar.filter((item) => item.kind === "skill_run")).toHaveLength(
      1,
    );

    const withoutSidecar = mergeSkillRunTranscriptIntoHistory(
      [],
      { runs: [], activities: [] },
      [continuation],
    );
    expect(
      withoutSidecar.filter((item) => item.kind === "skill_run"),
    ).toHaveLength(1);
    expect(withoutSidecar[0]).toMatchObject({
      clientRequestId: "req-live",
      auditComplete: false,
    });
  });

  it("labels incomplete sidecar history and does not match fallback by text", () => {
    const merged = mergeSkillRunTranscriptIntoHistory(
      [
        {
          kind: "assistant",
          id: 4,
          content: "[Skill completed successfully: writer]",
          timestamp: 50,
        },
      ],
      {
        runs: [run({ auditComplete: false, phase: "succeeded" })],
        activities: [],
      },
    );
    expect(merged.filter((item) => item.kind === "assistant")).toHaveLength(1);
    expect(merged.find((item) => item.kind === "skill_run")).toMatchObject({
      auditComplete: false,
    });
  });

  it("keeps prompt/execution/result order when adjacent Chat timestamps are reversed", () => {
    const laterChat: HistoryItem = {
      kind: "user",
      id: 80,
      content: "later chat",
      timestamp: 50,
    };
    const merged = mergeSkillRunTranscriptIntoHistory(
      [
        laterChat,
        userItem("req-a", 9_999),
        assistantFallback("req-a", 1),
      ],
      {
        runs: [run()],
        activities: [
          activity({ kind: "tool.call", callId: "call-1", toolName: "search", status: "completed", ordinal: 1 }),
        ],
      },
    );
    expect(merged.map((item) => item.kind)).toEqual([
      "user",
      "user",
      "tool_call",
      "assistant",
    ]);
    expect(merged[0]).toMatchObject({ content: "later chat" });
    expect(merged[1]).toMatchObject({
      platformMessageId: skillRunTranscriptBubbleIds("req-a").user,
    });
    expect(merged[2]).toMatchObject({ kind: "tool_call", name: "search", args: "" });
    expect(merged[3]).toMatchObject({ content: "done" });
  });
});

describe("deleteSessionRows sidecar cleanup", () => {
  it("deletes sidecar rows inside the existing session delete transaction", async () => {
    const { deleteSessionRows } = await import("./sessions");
    const db = {
      prepare: () => ({
        get: () => null,
        run: () => ({ changes: 1 }),
      }),
    };
    deleteSessionRows(db as never, "session-1");
    expect(deleteSkillRunTranscriptForSession).toHaveBeenCalledWith(
      db,
      "session-1",
    );
  });
});
