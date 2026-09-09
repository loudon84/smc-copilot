import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import {
  getSkillRunSessionMode,
  lockSkillRunSessionMode,
} from "./skill-run-session-mode-store";

vi.mock("../db", () => ({ getDbConnection: vi.fn() }));

const mockedGetDbConnection = vi.mocked(getDbConnection);

class FakeStatement {
  constructor(private readonly sql: string, private readonly db: FakeDb) {}

  get(sessionId?: string): unknown {
    if (this.sql.includes("sqlite_master")) {
      return this.db.tableCreated ? { name: "desktop_session_skill_run_mode" } : undefined;
    }
    if (this.sql.includes("SELECT tool_name")) {
      const row = sessionId ? this.db.rows.get(sessionId) : undefined;
      return row ? { ...row } : undefined;
    }
    if (this.sql.includes("provider_run_id")) return undefined;
    return undefined;
  }

  run(...args: string[]): void {
    if (this.sql.startsWith("INSERT")) {
      const [sessionId, toolName, toolTitle, updatedAt] = args;
      this.db.rows.set(sessionId, {
        tool_name: toolName,
        tool_title: toolTitle,
        updated_at: updatedAt,
        locked_at: updatedAt,
      });
    }
  }

  all(): unknown[] {
    if (this.sql.startsWith("PRAGMA table_info")) {
      return ["session_id", "tool_name", "tool_title", "updated_at", "locked_at"].map((name) => ({ name }));
    }
    return [];
  }
}

class FakeDb {
  tableCreated = false;
  readonly rows = new Map<string, {
    tool_name: string;
    tool_title: string;
    updated_at: string;
    locked_at?: string;
  }>();

  exec(): void { this.tableCreated = true; }
  prepare(sql: string): FakeStatement { return new FakeStatement(sql.trim(), this); }
  transaction<T>(fn: () => T): () => T { return fn; }
}

describe("skill run session-mode lock", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    mockedGetDbConnection.mockReset();
    mockedGetDbConnection.mockReturnValue(db as never);
  });

  afterEach(() => vi.restoreAllMocks());

  it("locks the first accepted tool, accepts the same tool, and rejects a different tool", () => {
    const first = lockSkillRunSessionMode("session-1", {
      executionMode: "skill-run",
      toolName: "writer.article",
      toolTitle: "Writer",
      updatedAt: "2026-09-09T00:00:00.000Z",
    });
    expect(first).toMatchObject({ status: "locked" });

    expect(lockSkillRunSessionMode("session-1", {
      executionMode: "skill-run",
      toolName: "writer.article",
      toolTitle: "Renamed Writer",
      updatedAt: "2026-09-09T00:00:01.000Z",
    })).toMatchObject({ status: "locked" });

    expect(lockSkillRunSessionMode("session-1", {
      executionMode: "skill-run",
      toolName: "research.answer",
      toolTitle: "Research",
      updatedAt: "2026-09-09T00:00:02.000Z",
    })).toMatchObject({ status: "conflict", existing: { toolName: "writer.article" } });

    expect(getSkillRunSessionMode("session-1")).toMatchObject({ toolName: "writer.article" });
  });
});
