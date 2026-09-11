// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedSession } from "./session-cache";
import { isSessionCacheChangedEvent } from "../shared/session-cache-events";

const harness = vi.hoisted(() => ({
  writeShouldFail: false,
  cacheContents: null as string | null,
  db: null as { prepare: (sql: string) => { all: () => unknown[]; get: () => undefined } } | null,
}));

vi.mock("./utils", () => ({
  activeStateDbPath: () => "/tmp/rm15-session-cache/state.db",
  profileHome: () => "/tmp/rm15-session-cache",
  getActiveProfileNameSync: () => "default",
  safeWriteFile: (_path: string, data: string) => {
    if (harness.writeShouldFail) throw new Error("ENOSPC");
    harness.cacheContents = data;
  },
}));

vi.mock("fs", () => ({
  existsSync: (path: string) => {
    if (String(path).endsWith("sessions.json")) {
      return harness.cacheContents !== null;
    }
    return false;
  },
  readFileSync: () => {
    if (harness.cacheContents === null) throw new Error("ENOENT");
    return harness.cacheContents;
  },
}));

vi.mock("./db", () => ({
  getDbConnection: () => harness.db,
}));

vi.mock("./session-context-folder-store", () => ({
  getSessionContextFolders: () => new Map(),
}));

vi.mock("./session-metadata-store", () => ({
  createSessionScope: (value: string) => value,
  ensureChatSessionMetadata: () => ({
    sessionKind: "chat",
    executionProvider: "hermes-chat",
  }),
  isSessionClassification: (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    (value as { sessionKind?: unknown }).sessionKind === "chat" &&
    (value as { executionProvider?: unknown }).executionProvider ===
      "hermes-chat",
}));

vi.mock("../shared/i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("./locale", () => ({
  getAppLocale: () => "en",
}));

vi.mock("better-sqlite3", () => ({
  default: class {
    prepare(): { run(): void } {
      return { run(): void {} };
    }
    close(): void {}
  },
}));

function session(overrides: Partial<CachedSession> = {}): CachedSession {
  return {
    id: "sess-1",
    title: "Hello world",
    startedAt: 1_700_000_000,
    source: "cli",
    messageCount: 1,
    model: "test-model",
    contextFolder: null,
    sessionKind: "chat",
    executionProvider: "hermes-chat",
    ...overrides,
  };
}

describe("session-cache mutation events", () => {
  beforeEach(() => {
    harness.writeShouldFail = false;
    harness.cacheContents = null;
    harness.db = null;
    vi.resetModules();
  });

  afterEach(async () => {
    const cache = await import("./session-cache");
    cache.resetSessionCacheChangedListenersForTests();
  });

  it("emits created then updated then deleted with only sessionId and reason", async () => {
    const cache = await import("./session-cache");
    const received: unknown[] = [];
    const unsubscribe = cache.subscribeSessionCacheChanged((event) => {
      received.push(event);
    });

    cache.upsertCachedSession(session());
    cache.upsertCachedSession(session({ title: "Renamed", messageCount: 2 }));
    cache.updateSessionTitle("sess-1", "From title API");
    cache.removeSessionFromCache("sess-1");

    expect(received).toEqual([
      { sessionId: "sess-1", reason: "created" },
      { sessionId: "sess-1", reason: "updated" },
      { sessionId: "sess-1", reason: "updated" },
      { sessionId: "sess-1", reason: "deleted" },
    ]);
    for (const event of received) {
      expect(isSessionCacheChangedEvent(event)).toBe(true);
      expect(Object.keys(event as object).sort()).toEqual(["reason", "sessionId"]);
      expect(JSON.stringify(event)).not.toMatch(
        /prompt|title|result|headers?|endpoint|auth|token|arguments?|output|bytes|url|path|raw/i,
      );
    }
    unsubscribe();
  });

  it("does not emit when the cache write fails", async () => {
    const cache = await import("./session-cache");
    const received: unknown[] = [];
    cache.subscribeSessionCacheChanged((event) => {
      received.push(event);
    });
    harness.writeShouldFail = true;
    cache.upsertCachedSession(session());
    expect(received).toEqual([]);
  });

  it("does not emit for no-op title or delete mutations", async () => {
    const cache = await import("./session-cache");
    const received: unknown[] = [];
    cache.subscribeSessionCacheChanged((event) => {
      received.push(event);
    });
    cache.updateSessionTitle("missing", "Nope");
    cache.removeSessionFromCache("missing");
    expect(received).toEqual([]);
  });

  it("does not emit from a full syncSessionCache write", async () => {
    const cache = await import("./session-cache");
    cache.upsertCachedSession(session());
    const received: unknown[] = [];
    cache.subscribeSessionCacheChanged((event) => {
      received.push(event);
    });
    harness.db = {
      prepare: () => ({
        all: () => [],
        get: () => undefined,
      }),
    };
    cache.syncSessionCache();
    expect(received).toEqual([]);
  });

  it("announces a classified Chat session after the targeted startup sync writes it", async () => {
    const cache = await import("./session-cache");
    const received: unknown[] = [];
    cache.subscribeSessionCacheChanged((event) => {
      received.push(event);
    });
    harness.db = {
      prepare: () => ({
        all: () => [
          {
            id: "desk-fresh-chat",
            started_at: 1_700_000_001,
            source: "api_server",
            message_count: 1,
            model: "test-model",
            title: "Fresh chat",
          },
        ],
        get: () => undefined,
      }),
    };

    cache.syncSessionCache({ announceSessionId: "desk-fresh-chat" });

    expect(received).toEqual([
      { sessionId: "desk-fresh-chat", reason: "created" },
    ]);
  });

  it("reports a targeted sync whose Chat session is not yet in the active database", async () => {
    const cache = await import("./session-cache");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      cache.syncSessionCache({ announceSessionId: "desk-not-durable-yet" });

      expect(warn).toHaveBeenCalledWith(
        "[session-cache] announced session missing after sync",
        { sessionId: "desk-not-durable-yet", stage: "database-unavailable" },
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("reports a targeted sync whose database has not persisted its session row", async () => {
    const cache = await import("./session-cache");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    harness.db = {
      prepare: () => ({
        all: () => [],
        get: () => undefined,
      }),
    };

    try {
      cache.syncSessionCache({ announceSessionId: "desk-row-not-found-yet" });

      expect(warn).toHaveBeenCalledWith(
        "[session-cache] announced session missing after sync",
        { sessionId: "desk-row-not-found-yet", stage: "session-not-found" },
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("reports a targeted sync whose cache write fails", async () => {
    const cache = await import("./session-cache");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    harness.writeShouldFail = true;
    harness.db = {
      prepare: () => ({
        all: () => [
          {
            id: "desk-cache-write-failed",
            started_at: 1_700_000_001,
            source: "api_server",
            message_count: 1,
            model: "test-model",
            title: "Fresh chat",
          },
        ],
        get: () => undefined,
      }),
    };

    try {
      cache.syncSessionCache({ announceSessionId: "desk-cache-write-failed" });

      expect(warn).toHaveBeenCalledWith(
        "[session-cache] announced session missing after sync",
        { sessionId: "desk-cache-write-failed", stage: "cache-write-failed" },
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("unsubscribe stops further events", async () => {
    const cache = await import("./session-cache");
    const received: unknown[] = [];
    const unsubscribe = cache.subscribeSessionCacheChanged((event) => {
      received.push(event);
    });
    cache.upsertCachedSession(session());
    unsubscribe();
    cache.upsertCachedSession(session({ title: "after unsub" }));
    expect(received).toEqual([{ sessionId: "sess-1", reason: "created" }]);
  });

  it("rejects payloads that carry content or extra keys", () => {
    expect(
      isSessionCacheChangedEvent({ sessionId: "sess-1", reason: "created" }),
    ).toBe(true);
    expect(
      isSessionCacheChangedEvent({
        sessionId: "sess-1",
        reason: "created",
        prompt: "secret",
      }),
    ).toBe(false);
    expect(
      isSessionCacheChangedEvent({
        sessionId: "sess-1",
        reason: "updated",
        title: "Hello",
      }),
    ).toBe(false);
    expect(isSessionCacheChangedEvent({ sessionId: "", reason: "created" })).toBe(
      false,
    );
    expect(
      isSessionCacheChangedEvent({ sessionId: "sess-1", reason: "renamed" }),
    ).toBe(false);
  });
});
