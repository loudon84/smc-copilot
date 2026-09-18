import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getDbConnection: () => mockDb,
}));

vi.mock("./session-cache", () => ({
  sessionTitleFromUserMessage: (text: string) => text.slice(0, 40) || "Chat",
  upsertCachedSession: vi.fn(),
}));

vi.mock("./session-metadata-store", () => ({
  createSessionScope: (descriptor: string) => `scope_${descriptor}`,
  ensureChatSessionMetadata: vi.fn(),
}));

import { upsertCachedSession } from "./session-cache";
import { ensureChatSessionMetadata } from "./session-metadata-store";
import {
  chatTurnPlatformMessageIds,
  materializeChatSessionTurn,
} from "./chat-session-materialize";

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
  platform_message_id: string | null;
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
    if (this.sql.includes("gateway_owned")) {
      const sessionId = String(args[0]);
      return {
        n: this.db.messages.filter(
          (m) =>
            m.session_id === sessionId &&
            m.active === 1 &&
            (m.platform_message_id == null ||
              !m.platform_message_id.startsWith("chat-mat:")),
        ).length,
      };
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
      const [id, source, startedAt, title, lastActivityAt, profileName] =
        args as [string, string, number, string, number, string | null];
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

  exec(): void {}

  prepare(sql: string): FakeStmt {
    return new FakeStmt(this, sql);
  }

  transaction(fn: () => void): () => void {
    return () => fn();
  }
}

let mockDb: FakeDb | null = new FakeDb();

describe("materializeChatSessionTurn", () => {
  beforeEach(() => {
    mockDb = new FakeDb();
    vi.mocked(upsertCachedSession).mockClear();
    vi.mocked(ensureChatSessionMetadata).mockClear();
  });

  it("writes session + user/assistant into state.db and updates chat cache", () => {
    const result = materializeChatSessionTurn({
      sessionId: "desk-1",
      userContent: "检查当前工作目录",
      assistantContent: "当前目录是 e:\\git\\smc-copilot",
      profileId: "default",
    });

    expect(result).toMatchObject({
      sessionId: "desk-1",
      wroteMessages: true,
    });
    expect(result?.cacheOnly).toBeUndefined();
    expect(mockDb!.sessions.get("desk-1")?.message_count).toBe(2);
    expect(mockDb!.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(upsertCachedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "desk-1",
        sessionKind: "chat",
        executionProvider: "hermes-chat",
        messageCount: 2,
      }),
    );
    expect(ensureChatSessionMetadata).toHaveBeenCalled();
  });

  it("is idempotent for the same turn content", () => {
    const input = {
      sessionId: "desk-1",
      userContent: "hello",
      assistantContent: "world",
      profileId: "default",
    };
    materializeChatSessionTurn(input);
    const second = materializeChatSessionTurn(input);

    expect(second?.wroteMessages).toBe(false);
    expect(mockDb!.messages).toHaveLength(2);
  });

  it("appends a second turn when desktop owns the transcript", () => {
    materializeChatSessionTurn({
      sessionId: "desk-1",
      userContent: "first",
      assistantContent: "one",
      profileId: "default",
    });
    materializeChatSessionTurn({
      sessionId: "desk-1",
      userContent: "second",
      assistantContent: "two",
      profileId: "default",
    });

    expect(mockDb!.messages).toHaveLength(4);
    expect(mockDb!.sessions.get("desk-1")?.message_count).toBe(4);
  });

  it("does not duplicate when gateway already owns messages", () => {
    mockDb!.sessions.set("desk-1", {
      id: "desk-1",
      title: "hello",
      source: "api_server",
      started_at: 1,
      message_count: 2,
      last_activity_at: 1,
      profile_name: "default",
    });
    mockDb!.messages.push(
      {
        id: 1,
        session_id: "desk-1",
        role: "user",
        content: "hello",
        timestamp: 1,
        platform_message_id: null,
        active: 1,
      },
      {
        id: 2,
        session_id: "desk-1",
        role: "assistant",
        content: "hi",
        timestamp: 2,
        platform_message_id: null,
        active: 1,
      },
    );

    const result = materializeChatSessionTurn({
      sessionId: "desk-1",
      userContent: "hello",
      assistantContent: "hi",
      profileId: "default",
    });

    expect(result?.wroteMessages).toBe(false);
    expect(mockDb!.messages).toHaveLength(2);
    expect(upsertCachedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "desk-1",
        messageCount: 2,
        sessionKind: "chat",
      }),
    );
  });

  it("returns null when session id or contents are empty", () => {
    expect(
      materializeChatSessionTurn({
        sessionId: "  ",
        userContent: "a",
        assistantContent: "b",
      }),
    ).toBeNull();
    expect(
      materializeChatSessionTurn({
        sessionId: "desk-1",
        userContent: "",
        assistantContent: "b",
      }),
    ).toBeNull();
  });

  it("builds stable platform message ids for a turn", () => {
    const ids = chatTurnPlatformMessageIds("desk-1", "u", "a");
    const digest = createHash("sha256")
      .update("desk-1\0u\0a")
      .digest("hex")
      .slice(0, 24);
    expect(ids).toEqual({
      user: `chat-mat:${digest}:user`,
      assistant: `chat-mat:${digest}:assistant`,
    });
  });
});
