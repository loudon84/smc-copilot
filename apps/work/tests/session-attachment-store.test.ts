import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync } from "fs";

const { TEST_HOME, stores } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(
      os.tmpdir(),
      `hermes-session-attachment-test-${Date.now()}`,
    ),
    stores: new Map<
      string,
      {
        messages: Array<{
          id: number;
          session_id: string;
          role: string;
          content: string;
        }>;
        tables: Set<string>;
      }
    >(),
  };
});

vi.mock("../src/main/utils", () => ({
  activeStateDbPath: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    return path.join(TEST_HOME, "state.db");
  },
}));

vi.mock("better-sqlite3", () => {
  // Vitest runs under Node; better-sqlite3 is Electron-ABI. Mock a minimal
  // state.db that has messages but no desktop_message_attachments.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");

  function getStore(dbPath: string) {
    let store = stores.get(dbPath);
    if (!store) {
      store = {
        messages: [],
        tables: new Set(["messages"]),
      };
      stores.set(dbPath, store);
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, "");
    }
    return store;
  }

  class MockStatement {
    constructor(
      private readonly store: {
        messages: Array<{
          id: number;
          session_id: string;
          role: string;
          content: string;
        }>;
        tables: Set<string>;
      },
      private readonly sql: string,
    ) {
      if (
        /FROM\s+desktop_message_attachments/i.test(sql) &&
        !store.tables.has("desktop_message_attachments")
      ) {
        const err = new Error("no such table: desktop_message_attachments");
        (err as Error & { code: string }).code = "SQLITE_ERROR";
        throw err;
      }
    }

    all(...params: unknown[]): unknown[] {
      if (/FROM\s+messages/i.test(this.sql)) {
        const sessionId = params[0] as string;
        return this.store.messages
          .filter((m) => m.session_id === sessionId && m.role === "user")
          .sort((a, b) => b.id - a.id)
          .slice(0, 50)
          .map((m) => ({ id: m.id, content: m.content }));
      }
      if (/FROM\s+sqlite_master/i.test(this.sql)) {
        const name = params[0] as string;
        return this.store.tables.has(name) ? [{ name }] : [];
      }
      return [];
    }

    get(...params: unknown[]): unknown {
      const rows = this.all(...params);
      return rows[0];
    }
  }

  class MockDatabase {
    private readonly store: ReturnType<typeof getStore>;

    constructor(dbPath: string) {
      this.store = getStore(dbPath);
    }

    prepare(sql: string): MockStatement {
      return new MockStatement(this.store, sql);
    }

    exec(): void {}

    close(): void {}
  }

  return { default: MockDatabase };
});

import { findUserMessageIdForPrompt } from "../src/main/session-attachment-store";

const DB_PATH = join(TEST_HOME, "state.db");

describe("findUserMessageIdForPrompt", () => {
  beforeEach(() => {
    mkdirSync(TEST_HOME, { recursive: true });
    writeFileSync(DB_PATH, "");
    stores.set(DB_PATH, {
      messages: [
        {
          id: 42,
          session_id: "sess-1",
          role: "user",
          content: "hello with a file",
        },
      ],
      tables: new Set(["messages"]),
    });
  });

  afterEach(() => {
    stores.clear();
    rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it("matches user messages when desktop_message_attachments does not exist", () => {
    expect(findUserMessageIdForPrompt("sess-1", "hello with a file")).toBe(42);
  });
});
