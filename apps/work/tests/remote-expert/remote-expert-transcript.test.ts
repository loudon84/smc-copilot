import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/main/db", () => ({
  getDbConnection: () => mockDb,
}));

vi.mock("../../src/main/session-cache", () => ({
  upsertCachedSession: vi.fn(),
}));

vi.mock("../../src/main/session-metadata-store", () => ({
  createSessionScope: (descriptor: string) => descriptor,
  REMOTE_EXPERT_SESSION_CLASSIFICATION: {
    sessionKind: "chat",
    executionProvider: "remote-expert-acp",
  },
  upsertSessionMetadata: vi.fn(),
}));

import { upsertCachedSession } from "../../src/main/session-cache";
import { materializeRemoteExpertTurn } from "../../src/main/remote-expert/remote-expert-transcript";

type MessageRow = {
  id: number;
  session_id: string;
  role: string;
  content: string;
  platform_message_id: string;
};

class FakeDb {
  sessions = new Map<string, { title: string }>();
  messages: MessageRow[] = [];
  nextId = 1;
  exec(): void {}
  transaction(fn: () => void) {
    return () => fn();
  }
  prepare(sql: string) {
    return {
      get: (...args: unknown[]) => {
        if (sql.includes("FROM sessions")) {
          return this.sessions.get(String(args[0]));
        }
        if (sql.includes("FROM messages WHERE platform_message_id")) {
          return this.messages.find((m) => m.platform_message_id === String(args[0]));
        }
        if (sql.includes("COUNT(*)")) {
          return { n: this.messages.filter((m) => m.session_id === String(args[0])).length };
        }
        return undefined;
      },
      run: (...args: unknown[]) => {
        if (sql.includes("INSERT INTO sessions")) {
          this.sessions.set(String(args[0]), { title: String(args[3]) });
          return;
        }
        if (sql.includes("UPDATE messages SET content")) {
          const content = String(args[0]);
          const platform = String(args[2]);
          const row = this.messages.find((m) => m.platform_message_id === platform);
          if (row) row.content = content;
          return;
        }
        if (sql.includes("INSERT INTO messages")) {
          this.messages.push({
            id: this.nextId++,
            session_id: String(args[0]),
            role: String(args[1]),
            content: String(args[2]),
            platform_message_id: String(args[4]),
          });
        }
      },
    };
  }
}

let mockDb: FakeDb;

describe("remote-expert transcript", () => {
  beforeEach(() => {
    mockDb = new FakeDb();
    vi.mocked(upsertCachedSession).mockClear();
  });

  it("[A-PERSIST-001] materializes user and assistant rows once", () => {
    materializeRemoteExpertTurn({
      sessionId: "s1",
      profileId: "default",
      turnId: "t1",
      userContent: "hello world",
      assistantContent: "hi",
    });
    materializeRemoteExpertTurn({
      sessionId: "s1",
      profileId: "default",
      turnId: "t1",
      userContent: "hello world",
      assistantContent: "hi again",
    });
    expect(mockDb.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(mockDb.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(upsertCachedSession).toHaveBeenCalled();
  });

  it("[A-TL-TRANSCRIPT-001] skips empty assistant insert then upserts final content", () => {
    materializeRemoteExpertTurn({
      sessionId: "s1",
      profileId: "default",
      turnId: "t1",
      userContent: "hello world",
      assistantContent: "",
    });
    expect(mockDb.messages.filter((m) => m.role === "user")).toHaveLength(1);
    expect(mockDb.messages.filter((m) => m.role === "assistant")).toHaveLength(0);

    materializeRemoteExpertTurn({
      sessionId: "s1",
      profileId: "default",
      turnId: "t1",
      userContent: "hello world",
      assistantContent: "final answer",
      reasoningContent: "think",
    });
    const assistants = mockDb.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.content).toBe("final answer");
    expect(mockDb.messages.find((m) => m.role === "reasoning")?.content).toBe(
      "think",
    );

    materializeRemoteExpertTurn({
      sessionId: "s1",
      profileId: "default",
      turnId: "t1",
      userContent: "hello world",
      assistantContent: "final answer v2",
    });
    expect(mockDb.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(mockDb.messages.find((m) => m.role === "assistant")?.content).toBe(
      "final answer v2",
    );
  });
});
