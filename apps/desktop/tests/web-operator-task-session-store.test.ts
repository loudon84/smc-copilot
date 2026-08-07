import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTaskId } from "../src/shared/web-operator/build-task-id";
import type { WebOperatorTaskPageContext } from "../src/shared/web-operator/web-operator-task-session-contract";

const sampleContext = (url: string): WebOperatorTaskPageContext => ({
  type: "web-operator",
  scopeKey: `scope:${url}`,
  summary: "test",
  payload: { url, title: "t", frameId: null },
});

describe("buildTaskId", () => {
  it("is stable for the same source and requestId", () => {
    const a = buildTaskId("crm", "REQ-001");
    const b = buildTaskId("crm", "REQ-001");
    expect(a).toBe(b);
    expect(a.startsWith("wot_")).toBe(true);
  });

  it("differs for different requestId with same source", () => {
    expect(buildTaskId("crm", "REQ-001")).not.toBe(buildTaskId("crm", "REQ-002"));
  });

  it("differs for different source with same requestId", () => {
    expect(buildTaskId("crm", "REQ-001")).not.toBe(buildTaskId("erp", "REQ-001"));
  });

  it("throws when source is empty", () => {
    expect(() => buildTaskId("  ", "REQ-001")).toThrow("source is required");
  });

  it("throws when requestId is empty", () => {
    expect(() => buildTaskId("crm", "  ")).toThrow("requestId is required");
  });
});

describe("web-operator-task-session-store", () => {
  let tempDir: string;
  let sqliteAvailable = true;

  afterEach(() => {
    if (!tempDir) return;
    try {
      const { setTaskSessionDbPathForTests } =
        require("../src/main/web-operator-task-session-store") as typeof import("../src/main/web-operator-task-session-store");
      setTaskSessionDbPathForTests(null);
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    tempDir = "";
  });

  async function openStore() {
    const mod = await import("../src/main/web-operator-task-session-store");
    tempDir = mkdtempSync(join(tmpdir(), "wo-task-session-"));
    mod.setTaskSessionDbPathForTests(join(tempDir, "test.db"));
    return mod;
  }

  it("returns null when table is empty", async () => {
    if (!sqliteAvailable) return;
    try {
      const { getLastActiveTaskSession } = await openStore();
      expect(getLastActiveTaskSession().record).toBeNull();
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });

  it("upsert creates record with source and requestId", async () => {
    if (!sqliteAvailable) return;
    try {
      const { upsertTaskSession, resolveTaskSession } = await openStore();
      const pageUrl = "https://example.com/a";

      const record = upsertTaskSession({
        source: "crm",
        requestId: "REQ-001",
        pageUrl,
        sessionId: "sess-1",
        pageContext: sampleContext(pageUrl),
        skill: "skill-a",
      });

      expect(record.source).toBe("crm");
      expect(record.requestId).toBe("REQ-001");
      expect(record.taskId).toBe(buildTaskId("crm", "REQ-001"));

      const lookup = resolveTaskSession({ source: "crm", requestId: "REQ-001" });
      expect(lookup.record?.sessionId).toBe("sess-1");
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });

  it("upsert updates same source/requestId and preserves created_at", async () => {
    if (!sqliteAvailable) return;
    try {
      const { upsertTaskSession } = await openStore();
      const pageUrl = "https://example.com/a";

      const first = upsertTaskSession({
        source: "crm",
        requestId: "REQ-001",
        pageUrl,
        sessionId: "sess-1",
        pageContext: sampleContext(pageUrl),
      });

      const second = upsertTaskSession({
        source: "crm",
        requestId: "REQ-001",
        pageUrl,
        sessionId: "sess-2",
        pageContext: sampleContext(pageUrl),
        skill: "skill-b",
      });

      expect(second.createdAt).toBe(first.createdAt);
      expect(second.updatedAt).not.toBe(first.updatedAt);
      expect(second.sessionId).toBe("sess-2");
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });

  it("allows duplicate pageUrl with different requestId", async () => {
    if (!sqliteAvailable) return;
    try {
      const { upsertTaskSession } = await openStore();
      const pageUrl = "https://example.com/order/1001";

      const a = upsertTaskSession({
        source: "crm",
        requestId: "REQ-001",
        pageUrl,
        sessionId: "sess-a",
        pageContext: sampleContext(pageUrl),
      });

      const b = upsertTaskSession({
        source: "crm",
        requestId: "REQ-002",
        pageUrl,
        sessionId: "sess-b",
        pageContext: sampleContext(pageUrl),
      });

      expect(a.taskId).not.toBe(b.taskId);
      expect(a.sessionId).not.toBe(b.sessionId);
      expect(a.pageUrl).toBe(b.pageUrl);
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });

  it("resolve returns null when no matching source/requestId", async () => {
    if (!sqliteAvailable) return;
    try {
      const { resolveTaskSession } = await openStore();
      const lookup = resolveTaskSession({ source: "crm", requestId: "MISSING" });
      expect(lookup.record).toBeNull();
      expect(lookup.taskId).toBe(buildTaskId("crm", "MISSING"));
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });

  it("returns the row with the latest updated_at", async () => {
    if (!sqliteAvailable) return;
    try {
      const { getLastActiveTaskSession, upsertTaskSession } = await openStore();

      const urlOld = "https://example.com/old";
      const urlNew = "https://example.com/new";

      upsertTaskSession({
        source: "manual",
        requestId: "req-old",
        pageUrl: urlOld,
        sessionId: "sess-old",
        pageContext: sampleContext(urlOld),
        skill: "skill-a",
      });

      upsertTaskSession({
        source: "manual",
        requestId: "req-new",
        pageUrl: urlNew,
        sessionId: "sess-new",
        pageContext: sampleContext(urlNew),
        skill: "skill-b",
      });

      const last = getLastActiveTaskSession().record;
      expect(last?.sessionId).toBe("sess-new");
      expect(last?.pageUrl).toBe(urlNew);
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });

  it("prepareNewTaskSession clears existing binding for source+requestId", async () => {
    if (!sqliteAvailable) return;
    try {
      const { prepareNewTaskSession, resolveTaskSession, upsertTaskSession } = await openStore();
      const pageUrl = "https://example.com/a";

      upsertTaskSession({
        source: "crm",
        requestId: "REQ-001",
        pageUrl,
        sessionId: "sess-old",
        pageContext: sampleContext(pageUrl),
      });

      prepareNewTaskSession({ source: "crm", requestId: "REQ-001" });

      const lookup = resolveTaskSession({ source: "crm", requestId: "REQ-001" });
      expect(lookup.record).toBeNull();

      const created = upsertTaskSession({
        source: "crm",
        requestId: "REQ-001",
        pageUrl,
        sessionId: "sess-new",
        pageContext: sampleContext(pageUrl),
        createNewSession: true,
      });

      expect(created.sessionId).toBe("sess-new");
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });

  it("upsert releases session_id from other task rows before binding", async () => {
    if (!sqliteAvailable) return;
    try {
      const { upsertTaskSession, resolveTaskSession } = await openStore();
      const pageUrl = "https://example.com/shared";

      upsertTaskSession({
        source: "legacy-page-url",
        requestId: pageUrl,
        pageUrl,
        sessionId: "sess-shared",
        pageContext: sampleContext(pageUrl),
      });

      const rebound = upsertTaskSession({
        source: "web-host-bridge",
        requestId: "req-new",
        pageUrl,
        sessionId: "sess-shared",
        pageContext: sampleContext(pageUrl),
        skill: "skill-b",
      });

      expect(rebound.sessionId).toBe("sess-shared");
      expect(rebound.source).toBe("web-host-bridge");

      const legacy = resolveTaskSession({ source: "legacy-page-url", requestId: pageUrl });
      expect(legacy.record?.status).toBe("archived");
      expect(legacy.record?.sessionId.startsWith("released:")).toBe(true);
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });

  it("migrates v1 schema to v2 with legacy source", async () => {
    if (!sqliteAvailable) return;
    try {
      tempDir = mkdtempSync(join(tmpdir(), "wo-task-session-"));
      const dbPath = join(tempDir, "test.db");
      const v1Db = new Database(dbPath);
      v1Db.exec(`
        CREATE TABLE task_session (
          task_id TEXT PRIMARY KEY,
          page_url TEXT NOT NULL UNIQUE,
          session_id TEXT NOT NULL UNIQUE,
          page_context_json TEXT NOT NULL,
          skill TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const pageUrl = "https://example.com/a";
      const ctx = JSON.stringify(sampleContext(pageUrl));
      v1Db
        .prepare(
          `INSERT INTO task_session (task_id, page_url, session_id, page_context_json, skill, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, '', 'active', ?, ?)`,
        )
        .run("wot_old", pageUrl, "sess-legacy", ctx, "2020-01-01T00:00:00.000Z", "2020-01-02T00:00:00.000Z");
      v1Db.close();

      const { setTaskSessionDbPathForTests, resolveTaskSession } = await import(
        "../src/main/web-operator-task-session-store"
      );
      setTaskSessionDbPathForTests(dbPath);

      const lookup = resolveTaskSession({
        source: "legacy-page-url",
        requestId: pageUrl,
      });

      expect(lookup.record?.sessionId).toBe("sess-legacy");
      expect(lookup.record?.source).toBe("legacy-page-url");
      expect(lookup.record?.requestId).toBe(pageUrl);
      expect(lookup.taskId).toBe(buildTaskId("legacy-page-url", pageUrl));
    } catch (e) {
      sqliteAvailable = false;
      expect(String(e)).toMatch(/NODE_MODULE_VERSION|better_sqlite3/i);
    }
  });
});
