import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../db";
import { materializeExpertSessionTranscript } from "./expert-session-materialize";
import type { ExpertRunProjection } from "../../shared/expert";

vi.mock("../db", () => ({
  getDbConnection: vi.fn(),
}));

vi.mock("../session-cache", () => ({
  sessionTitleFromUserMessage: (prompt: string) =>
    prompt.trim().slice(0, 45) || "New conversation",
  upsertCachedSession: vi.fn(),
}));

const mockedGetDbConnection = vi.mocked(getDbConnection);

type MsgRow = {
  id: number;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  platform_message_id: string | null;
  active: number;
};

type SessionRow = {
  id: string;
  source: string;
  started_at: number;
  message_count: number;
  title: string | null;
  last_activity_at: number | null;
  profile_name: string | null;
};

class FakeStatement {
  constructor(
    private readonly sql: string,
    private readonly db: FakeDb,
  ) {}

  get(...args: unknown[]): unknown {
    const sql = this.sql;
    if (sql.includes("FROM messages WHERE platform_message_id")) {
      const id = String(args[0]);
      const row = this.db.messages.find((m) => m.platform_message_id === id);
      return row ? { id: row.id } : undefined;
    }
    if (sql.includes("COUNT(*)")) {
      const sessionId = String(args[0]);
      const n = this.db.messages.filter(
        (m) => m.session_id === sessionId && m.active === 1,
      ).length;
      return { n };
    }
    if (sql.includes("FROM sessions WHERE title = ? AND id != ?")) {
      const title = String(args[0]);
      const sessionId = String(args[1]);
      for (const row of this.db.sessions.values()) {
        if (row.title === title && row.id !== sessionId) {
          return { id: row.id };
        }
      }
      return undefined;
    }
    if (sql.includes("FROM sessions WHERE id")) {
      const sessionId = String(args[0]);
      const row = this.db.sessions.get(sessionId);
      if (!row) return undefined;
      if (sql.includes("SELECT title FROM sessions")) {
        return { title: row.title };
      }
      if (sql.includes("SELECT id FROM sessions")) {
        return { id: row.id };
      }
      return {
        message_count: row.message_count,
        started_at: row.started_at,
      };
    }
    return undefined;
  }

  run(...args: unknown[]): void {
    const sql = this.sql;
    if (
      sql.startsWith("INSERT INTO sessions") ||
      sql.startsWith("INSERT OR IGNORE INTO sessions")
    ) {
      const [id, source, startedAt, title, lastActivity, profileName] =
        args as [string, string, number, string, number, string | null];
      const existing = this.db.sessions.get(id);
      if (!existing) {
        for (const row of this.db.sessions.values()) {
          if (row.title === title) {
            throw Object.assign(
              new Error("UNIQUE constraint failed: sessions.title"),
              { code: "SQLITE_CONSTRAINT_UNIQUE" },
            );
          }
        }
        this.db.sessions.set(id, {
          id,
          source,
          started_at: startedAt,
          message_count: 0,
          title,
          last_activity_at: lastActivity,
          profile_name: profileName,
        });
      } else if (sql.includes("ON CONFLICT")) {
        const nextTitle =
          existing.title && existing.title.trim() ? existing.title : title;
        if (nextTitle !== existing.title) {
          for (const row of this.db.sessions.values()) {
            if (row.id !== id && row.title === nextTitle) {
              throw Object.assign(
                new Error("UNIQUE constraint failed: sessions.title"),
                { code: "SQLITE_CONSTRAINT_UNIQUE" },
              );
            }
          }
        }
        existing.title = nextTitle;
        existing.last_activity_at = lastActivity;
        existing.profile_name = existing.profile_name ?? profileName;
      }
      return;
    }
    if (sql.startsWith("INSERT INTO messages")) {
      const [sessionId, content, timestamp, platformId] = args as [
        string,
        string,
        number,
        string,
      ];
      if (!this.db.sessions.has(sessionId)) {
        throw Object.assign(new Error("FOREIGN KEY constraint failed"), {
          code: "SQLITE_CONSTRAINT_FOREIGNKEY",
        });
      }
      const role = sql.includes("'user'") ? "user" : "assistant";
      this.db.nextId += 1;
      this.db.messages.push({
        id: this.db.nextId,
        session_id: sessionId,
        role,
        content,
        timestamp,
        platform_message_id: platformId,
        active: 1,
      });
      return;
    }
    if (sql.startsWith("UPDATE messages SET content")) {
      const [content, _timestamp, id] = args as [string, number, number];
      const row = this.db.messages.find((m) => m.id === id);
      if (row) row.content = content;
      return;
    }
    if (sql.startsWith("UPDATE sessions SET message_count")) {
      const [count, lastActivity, id] = args as [number, number, string];
      const row = this.db.sessions.get(id);
      if (!row) return;
      row.message_count = count;
      row.last_activity_at = lastActivity;
    }
  }
}

class FakeDb {
  sessions = new Map<string, SessionRow>();
  messages: MsgRow[] = [];
  nextId = 0;

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql.trim(), this);
  }

  transaction<T>(fn: () => T): () => T {
    return () => fn();
  }
}

function projection(
  overrides: Partial<ExpertRunProjection> = {},
): ExpertRunProjection {
  return {
    clientRequestId: "expert-req-1",
    taskId: "task-1",
    phase: "succeeded",
    displayStage: "finalizing",
    expertSlug: "slug",
    skillName: "skill",
    prompt: "请分析客户画像",
    sessionId: "desk-1",
    profileId: "default",
    lastEventId: null,
    lastEventSeq: null,
    errorCode: null,
    errorMessage: null,
    resultSummary: "summary",
    resultContent: "full result",
    progressMessage: null,
      artifactDiscovery: "idle",
      artifactDiscoveryError: null,
      artifactFileIds: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("materializeExpertSessionTranscript", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    mockedGetDbConnection.mockReturnValue(db as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // @lat: [[expert-execution-tests#Terminal transcript materialize]]
  it("writes session + user/assistant messages once and is idempotent", () => {
    const first = materializeExpertSessionTranscript(projection());
    expect(first?.wroteMessages).toBe(true);
    expect(db.sessions.get("desk-1")?.title).toContain("请分析");
    expect(db.messages).toHaveLength(2);
    expect(db.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(db.messages[1]?.content).toBe("full result");
    expect(db.sessions.get("desk-1")?.message_count).toBe(2);

    const second = materializeExpertSessionTranscript(projection());
    expect(second?.wroteMessages).toBe(false);
    expect(db.messages).toHaveLength(2);
  });

  it("skips runs without taskId (not yet accepted)", () => {
    expect(
      materializeExpertSessionTranscript(
        projection({ phase: "starting", taskId: null }),
      ),
    ).toBeNull();
    expect(db.messages).toHaveLength(0);
  });

  it("updates assistant row on running task.progress", () => {
    materializeExpertSessionTranscript(
      projection({ phase: "running", resultContent: null }),
    );
    expect(db.messages[1]?.content).toBe("专家正在分析…");
    materializeExpertSessionTranscript(
      projection({
        phase: "running",
        resultContent: null,
        progressMessage: "正在检索市场数据…",
      }),
    );
    expect(db.messages).toHaveLength(2);
    expect(db.messages[1]?.content).toBe("正在检索市场数据…");
    materializeExpertSessionTranscript(projection());
    expect(db.messages[1]?.content).toBe("full result");
  });

  it("falls back to cache-only when state.db is unavailable", async () => {
    const { upsertCachedSession } = await import("../session-cache");
    mockedGetDbConnection.mockReturnValue(null);
    const result = materializeExpertSessionTranscript(projection());
    expect(result).toMatchObject({
      sessionId: "desk-1",
      cacheOnly: true,
      wroteMessages: false,
    });
    expect(upsertCachedSession).toHaveBeenCalled();
  });

  it("disambiguates title when another session already owns it", () => {
    db.sessions.set("other", {
      id: "other",
      source: "api_server",
      started_at: 1,
      message_count: 1,
      title: "请分析客户画像",
      last_activity_at: 1,
      profile_name: null,
    });
    const result = materializeExpertSessionTranscript(
      projection({ sessionId: "desk-2" }),
    );
    expect(result?.wroteMessages).toBe(true);
    expect(result?.cacheOnly).toBeUndefined();
    expect(db.sessions.get("desk-2")?.title).not.toBe("请分析客户画像");
    expect(db.sessions.get("desk-2")?.title).toContain("请分析客户画像");
    expect(db.messages).toHaveLength(2);
  });
});
