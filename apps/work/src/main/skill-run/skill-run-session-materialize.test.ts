import { describe, expect, it, vi } from "vitest";
import {
  buildSkillRunTranscriptAssistantContent,
  materializeSkillRunSessionTranscript,
  shouldMaterializeSkillRunSession,
} from "./skill-run-session-materialize";
import type { SkillRunProjection } from "../../shared/skill-run";

vi.mock("../db", () => ({
  getDbConnection: () => mockDb,
}));

vi.mock("../session-cache", () => ({
  sessionTitleFromUserMessage: (text: string) => text.slice(0, 40) || "Skill",
  upsertCachedSession: vi.fn(),
}));

import { upsertCachedSession } from "../session-cache";

type SessionRow = {
  id: string;
  title: string;
  source: string;
  started_at: number;
  message_count: number;
  last_activity_at: number;
  profile_name: string | null;
};

type MessageRow = {
  id: number;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  platform_message_id: string;
  active: number;
};

class FakeStmt {
  constructor(
    private readonly db: FakeDb,
    private readonly sql: string,
  ) {}

  get(...args: unknown[]): unknown {
    if (this.sql.includes("FROM messages WHERE platform_message_id")) {
      const pmid = String(args[0]);
      return this.db.messages.find((m) => m.platform_message_id === pmid);
    }
    if (this.sql.includes("FROM sessions WHERE title = ? AND id != ?")) {
      const title = String(args[0]);
      const sessionId = String(args[1]);
      for (const row of this.db.sessions.values()) {
        if (row.title === title && row.id !== sessionId) return { id: row.id };
      }
      return undefined;
    }
    if (this.sql.includes("SELECT title FROM sessions")) {
      const row = this.db.sessions.get(String(args[0]));
      return row ? { title: row.title } : undefined;
    }
    if (this.sql.includes("SELECT id FROM sessions")) {
      const row = this.db.sessions.get(String(args[0]));
      return row ? { id: row.id } : undefined;
    }
    if (this.sql.includes("SELECT message_count, started_at FROM sessions")) {
      const row = this.db.sessions.get(String(args[0]));
      return row
        ? { message_count: row.message_count, started_at: row.started_at }
        : undefined;
    }
    if (this.sql.includes("SELECT COUNT(*) AS n FROM messages")) {
      const sessionId = String(args[0]);
      return {
        n: this.db.messages.filter(
          (m) => m.session_id === sessionId && m.active === 1,
        ).length,
      };
    }
    return undefined;
  }

  run(...args: unknown[]): void {
    if (this.sql.startsWith("INSERT INTO sessions")) {
      const [id, source, startedAt, title, lastActivityAt, profileName] = args as [
        string,
        string,
        number,
        string,
        number,
        string | null,
      ];
      const existing = this.db.sessions.get(id);
      if (!existing) {
        this.db.sessions.set(id, {
          id,
          source,
          started_at: startedAt,
          message_count: 0,
          title,
          last_activity_at: lastActivityAt,
          profile_name: profileName,
        });
      } else {
        existing.title = existing.title || title;
        existing.last_activity_at = lastActivityAt;
        existing.profile_name = existing.profile_name ?? profileName;
      }
      return;
    }
    if (this.sql.startsWith("INSERT INTO messages")) {
      const role = this.sql.includes("'user'")
        ? "user"
        : this.sql.includes("'assistant'")
          ? "assistant"
          : "unknown";
      const [sessionId, content, timestamp, platformMessageId] = args as [
        string,
        string,
        number,
        string,
      ];
      this.db.messages.push({
        id: this.db.nextMessageId++,
        session_id: sessionId,
        role,
        content,
        timestamp,
        platform_message_id: platformMessageId,
        active: 1,
      });
      return;
    }
    if (this.sql.startsWith("UPDATE messages SET content")) {
      const [content, timestamp, id] = args as [string, number, number];
      const row = this.db.messages.find((m) => m.id === id);
      if (row) {
        row.content = content;
        row.timestamp = timestamp;
      }
      return;
    }
    if (this.sql.startsWith("UPDATE sessions SET message_count")) {
      const [count, lastActivityAt, id] = args as [number, number, string];
      const row = this.db.sessions.get(id);
      if (row) {
        row.message_count = count;
        row.last_activity_at = lastActivityAt;
      }
    }
  }
}

class FakeDb {
  sessions = new Map<string, SessionRow>();
  messages: MessageRow[] = [];
  nextMessageId = 1;

  prepare(sql: string): FakeStmt {
    return new FakeStmt(this, sql);
  }

  transaction(fn: () => void): () => void {
    return () => fn();
  }
}

let mockDb: FakeDb | null = new FakeDb();

function projection(
  overrides: Partial<SkillRunProjection> = {},
): SkillRunProjection {
  return {
    clientRequestId: "req-1",
    providerRunId: "task-1",
    toolName: "hermes_xieyi__customer-profiling",
    promptSummary: "请分析客户画像",
    sessionId: "skill-session-1",
    profileId: "default",
    phase: "running",
    displayStage: "Executing skill...",
    lastEventId: null,
    eventSeq: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("skill-run-session-materialize", () => {
  it("gates materialize until providerRunId exists", () => {
    expect(
      shouldMaterializeSkillRunSession({
        providerRunId: null,
        phase: "pending-submit",
      }),
    ).toBe(false);
    expect(
      shouldMaterializeSkillRunSession({
        providerRunId: "task-1",
        phase: "running",
      }),
    ).toBe(true);
  });

  it("writes Hermes sessions/messages columns without created_at", () => {
    mockDb = new FakeDb();
    const result = materializeSkillRunSessionTranscript(projection());
    expect(result?.wroteMessages).toBe(true);
    expect(mockDb.sessions.get("skill-session-1")).toEqual(
      expect.objectContaining({
        id: "skill-session-1",
        title: "请分析客户画像",
        message_count: 2,
      }),
    );
    expect(mockDb.messages).toHaveLength(2);
    expect(mockDb.messages[0]?.platform_message_id).toBe("skill-run:req-1:user");
    expect(mockDb.messages[1]?.role).toBe("assistant");
  });

  it("updates assistant content on later projections", () => {
    mockDb = new FakeDb();
    materializeSkillRunSessionTranscript(projection());
    materializeSkillRunSessionTranscript(
      projection({
        phase: "succeeded",
        text: "profile ready",
      }),
    );
    expect(mockDb.messages).toHaveLength(2);
    expect(mockDb.messages[1]?.content).toBe("profile ready");
    expect(
      buildSkillRunTranscriptAssistantContent(
        projection({ phase: "succeeded", text: "profile ready" }),
      ),
    ).toBe("profile ready");
  });

  it("writes the exact Prompt and title, and does not duplicate the user row", () => {
    mockDb = new FakeDb();
    const exactPrompt = `${"请完整分析客户画像并给出可执行建议。".repeat(8)}`;
    expect(exactPrompt.length).toBeGreaterThan(120);
    materializeSkillRunSessionTranscript(projection(), exactPrompt);
    materializeSkillRunSessionTranscript(
      projection({ phase: "succeeded", text: "done" }),
      exactPrompt,
    );
    const user = mockDb.messages.find((m) => m.role === "user");
    expect(user?.content).toBe(exactPrompt);
    expect(user?.platform_message_id).toBe("skill-run:req-1:user");
    expect(mockDb.sessions.get("skill-session-1")?.title).toBe(
      exactPrompt.slice(0, 40),
    );
    expect(mockDb.messages.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("keeps promptSummary fallback when no exact Prompt is provided", () => {
    mockDb = new FakeDb();
    materializeSkillRunSessionTranscript(projection());
    expect(mockDb.messages[0]?.content).toBe("请分析客户画像");
  });

  it("falls back to cache when DB is missing or throws", () => {
    vi.mocked(upsertCachedSession).mockClear();
    mockDb = null;
    const missing = materializeSkillRunSessionTranscript(
      projection(),
      "cache-only prompt",
    );
    expect(missing).toMatchObject({ cacheOnly: true, wroteMessages: false });
    expect(upsertCachedSession).toHaveBeenCalled();

    mockDb = new FakeDb();
    mockDb.transaction = () => {
      throw new Error("disk locked");
    };
    vi.mocked(upsertCachedSession).mockClear();
    const failed = materializeSkillRunSessionTranscript(
      projection(),
      "db-failure prompt",
    );
    expect(failed).toMatchObject({ cacheOnly: true, wroteMessages: false });
    expect(upsertCachedSession).toHaveBeenCalled();
  });
});
