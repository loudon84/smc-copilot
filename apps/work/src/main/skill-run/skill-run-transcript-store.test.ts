// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import type {
  SkillRunDurableActivityRecord,
  SkillRunDurableRunSnapshot,
} from "./skill-run-service";

vi.mock("../db", () => ({
  getDbConnection: vi.fn(),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);

type RunRow = Record<string, unknown>;
type ActivityRow = Record<string, unknown>;

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly db: FakeDb,
  ) {}

  get(name?: string): unknown {
    if (this.sql.includes("sqlite_master")) {
      const table = String(name ?? "");
      return this.db.tables.has(table) ? { name: table } : undefined;
    }
    return undefined;
  }

  run(...args: unknown[]): void {
    if (this.sql.includes(`INSERT INTO ${this.db.runTable}`)) {
      const row = this.db.argsToRun(args);
      this.db.runs.set(String(row.client_request_id), row);
      return;
    }
    if (this.sql.includes(`INSERT OR IGNORE INTO ${this.db.activityTable}`)) {
      const row = this.db.argsToActivity(args);
      const key = `${row.client_request_id}\0${row.event_id}`;
      if (!this.db.activities.has(key)) {
        this.db.activities.set(key, row);
      }
      return;
    }
    if (this.sql.startsWith("DELETE") && this.sql.includes(this.db.activityTable)) {
      const sessionId = String(args[0]);
      for (const [key, row] of this.db.activities) {
        if (row.session_id === sessionId) this.db.activities.delete(key);
      }
      return;
    }
    if (this.sql.startsWith("DELETE") && this.sql.includes(this.db.runTable)) {
      const sessionId = String(args[0]);
      for (const [key, row] of this.db.runs) {
        if (row.session_id === sessionId) this.db.runs.delete(key);
      }
    }
  }

  all(sessionId?: string): unknown[] {
    if (this.sql.includes(this.db.runTable)) {
      return [...this.db.runs.values()]
        .filter((row) => row.session_id === sessionId)
        .sort((a, b) =>
          String(a.updated_at).localeCompare(String(b.updated_at)) ||
          String(a.client_request_id).localeCompare(String(b.client_request_id)),
        );
    }
    if (this.sql.includes(this.db.activityTable)) {
      return [...this.db.activities.values()]
        .filter((row) => row.session_id === sessionId)
        .sort(
          (a, b) =>
            String(a.client_request_id).localeCompare(String(b.client_request_id)) ||
            Number(a.ordinal) - Number(b.ordinal) ||
            String(a.event_id).localeCompare(String(b.event_id)),
        );
    }
    return [];
  }
}

class FakeDb {
  readonly runTable = "skill_run_transcript_runs";
  readonly activityTable = "skill_run_transcript_activities";
  readonly tables = new Set<string>();
  readonly runs = new Map<string, RunRow>();
  readonly activities = new Map<string, ActivityRow>();

  exec(): void {
    this.tables.add(this.runTable);
    this.tables.add(this.activityTable);
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql.trim(), this);
  }

  argsToRun(args: unknown[]): RunRow {
    const [
      client_request_id,
      session_id,
      profile_id,
      tool_name,
      prompt,
      provider_run_id,
      phase,
      display_stage,
      last_event_id,
      event_seq,
      result_text,
      error_code,
      error_message,
      artifacts_json,
      created_at,
      updated_at,
      audit_complete,
    ] = args;
    return {
      client_request_id,
      session_id,
      profile_id,
      tool_name,
      prompt,
      provider_run_id,
      phase,
      display_stage,
      last_event_id,
      event_seq,
      result_text,
      error_code,
      error_message,
      artifacts_json,
      created_at,
      updated_at,
      audit_complete,
    };
  }

  argsToActivity(args: unknown[]): ActivityRow {
    const [
      client_request_id,
      event_id,
      session_id,
      ordinal,
      kind,
      summary,
      tool_name,
      call_id,
      status,
      question,
      options_json,
      approval_id,
    ] = args;
    return {
      client_request_id,
      event_id,
      session_id,
      ordinal,
      kind,
      summary,
      tool_name,
      call_id,
      status,
      question,
      options_json,
      approval_id,
    };
  }
}

function baseRun(
  overrides: Partial<SkillRunDurableRunSnapshot> = {},
): SkillRunDurableRunSnapshot {
  return {
    clientRequestId: "req-a",
    sessionId: "session-1",
    profileId: "default",
    toolName: "calculator",
    prompt: "hello world",
    providerRunId: "run-1",
    phase: "running",
    displayStage: "Executing skill...",
    lastEventId: "evt-1",
    eventSeq: 1,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:01.000Z",
    auditComplete: true,
    ...overrides,
  };
}

function baseActivity(
  overrides: Partial<SkillRunDurableActivityRecord> = {},
): SkillRunDurableActivityRecord {
  return {
    clientRequestId: "req-a",
    sessionId: "session-1",
    eventId: "evt-1",
    kind: "reasoning.summary",
    ordinal: 1,
    summary: "thinking",
    ...overrides,
  };
}

describe("skill-run-transcript-store", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    mockedGetDbConnection.mockImplementation(() => db as never);
  });

  afterEach(() => {
    mockedGetDbConnection.mockReset();
  });

  it("upserts runs and 100 ordered activities then round-trips a session batch", async () => {
    const store = await import("./skill-run-transcript-store");
    store.upsertSkillRunTranscriptRun(baseRun({ prompt: "exact-prompt" }));
    for (let index = 1; index <= 100; index += 1) {
      store.appendSkillRunTranscriptActivity(
        baseActivity({
          eventId: `evt-${index}`,
          ordinal: index,
          summary: `step ${index}`,
        }),
      );
    }
    store.upsertSkillRunTranscriptRun(
      baseRun({
        prompt: "exact-prompt",
        phase: "succeeded",
        updatedAt: "2026-09-08T00:00:02.000Z",
        text: "done",
      }),
    );
    const batch = store.listSkillRunTranscriptForSession("session-1");
    expect(batch.runs).toHaveLength(1);
    expect(batch.runs[0]?.prompt).toBe("exact-prompt");
    expect(batch.runs[0]?.phase).toBe("succeeded");
    expect(batch.activities).toHaveLength(100);
    expect(batch.activities[0]?.eventId).toBe("evt-1");
    expect(batch.activities[99]?.eventId).toBe("evt-100");
    expect(batch.activities[99]?.ordinal).toBe(100);
  });

  it("keeps A/A/B as three request identities and ignores duplicate event ids", async () => {
    const store = await import("./skill-run-transcript-store");
    store.upsertSkillRunTranscriptRun(baseRun({ clientRequestId: "req-a1" }));
    store.upsertSkillRunTranscriptRun(baseRun({ clientRequestId: "req-a2" }));
    store.upsertSkillRunTranscriptRun(
      baseRun({ clientRequestId: "req-b", toolName: "writer" }),
    );
    store.appendSkillRunTranscriptActivity(
      baseActivity({ clientRequestId: "req-a1", eventId: "evt-shared" }),
    );
    store.appendSkillRunTranscriptActivity(
      baseActivity({ clientRequestId: "req-a1", eventId: "evt-shared", ordinal: 9 }),
    );
    store.appendSkillRunTranscriptActivity(
      baseActivity({ clientRequestId: "req-b", eventId: "evt-shared", ordinal: 1 }),
    );
    const batch = store.listSkillRunTranscriptForSession("session-1");
    expect(batch.runs.map((row) => row.clientRequestId)).toEqual([
      "req-a1",
      "req-a2",
      "req-b",
    ]);
    expect(
      batch.activities.filter((row) => row.clientRequestId === "req-a1"),
    ).toHaveLength(1);
    expect(
      batch.activities.filter((row) => row.clientRequestId === "req-b"),
    ).toHaveLength(1);
  });

  it("deletes child activities before runs and rejects forbidden payload fields", async () => {
    const store = await import("./skill-run-transcript-store");
    store.upsertSkillRunTranscriptRun(baseRun());
    store.appendSkillRunTranscriptActivity(baseActivity());
    store.deleteSkillRunTranscriptForSession(db as never, "session-1");
    expect(store.listSkillRunTranscriptForSession("session-1")).toEqual({
      runs: [],
      activities: [],
    });
    expect(() =>
      store.upsertSkillRunTranscriptRun({
        ...baseRun(),
        ...( { endpoint: "https://secret" } as object),
      } as SkillRunDurableRunSnapshot),
    ).toThrow(/FORBIDDEN_FIELD/);
  });

  it("throws when the database is unavailable and does not invent rows", async () => {
    const store = await import("./skill-run-transcript-store");
    mockedGetDbConnection.mockReturnValue(null);
    expect(() => store.upsertSkillRunTranscriptRun(baseRun())).toThrow(
      /UNAVAILABLE/,
    );
    expect(store.listSkillRunTranscriptForSession("session-1")).toEqual({
      runs: [],
      activities: [],
    });
  });
});
