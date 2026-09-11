import type Database from "better-sqlite3";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_SESSION_CLASSIFICATION,
  SKILL_RUN_SESSION_CLASSIFICATION,
  createSessionScope,
  ensureChatSessionMetadata,
  ensureSkillRunSessionMetadata,
  getSessionMetadata,
  isSessionClassification,
  upsertSessionMetadata,
} from "./session-metadata-store";
import { setSkillRunFeatureMode } from "./skill-run/feature-mode-store";

const USER_DATA = "E:/tmp/work-session-metadata-feature-mode-test";
const STORE_FILE = join(USER_DATA, "skill-run-feature-mode.json");

vi.mock("electron", () => ({
  app: {
    getPath: () => "E:/tmp/work-session-metadata-feature-mode-test",
  },
}));

type MetadataRow = {
  session_scope: string;
  profile_id: string;
  session_id: string;
  session_kind: string;
  execution_provider: string;
};

class MetadataDb {
  private tableCreated = false;
  private readonly rowsByIdentity = new Map<string, MetadataRow>();

  exec(): void {
    this.tableCreated = true;
  }

  prepare(sql: string): { get: (...args: string[]) => unknown; run: (...args: string[]) => void } {
    return {
      get: (...args: string[]) => {
        if (sql.includes("sqlite_master")) {
          return this.tableCreated ? { name: "desktop_session_metadata" } : undefined;
        }
        if (sql.includes("FROM desktop_session_metadata")) {
          const [scope, profileId, sessionId] = args;
          return this.rowsByIdentity.get(`${scope}|${profileId}|${sessionId}`);
        }
        return undefined;
      },
      run: (...args: string[]) => {
        if (!sql.includes("INSERT INTO desktop_session_metadata")) return;
        const [sessionScope, profileId, sessionId, sessionKind, executionProvider] = args;
        this.rowsByIdentity.set(`${sessionScope}|${profileId}|${sessionId}`, {
          session_scope: sessionScope,
          profile_id: profileId,
          session_id: sessionId,
          session_kind: sessionKind,
          execution_provider: executionProvider,
        });
      },
    };
  }

  rows(): MetadataRow[] {
    return [...this.rowsByIdentity.values()];
  }
}

function openDb(): { db: Database.Database; raw: MetadataDb } {
  const raw = new MetadataDb();
  return { db: raw as unknown as Database.Database, raw };
}

describe("session metadata classification", () => {
  beforeEach(() => {
    mkdirSync(USER_DATA, { recursive: true });
    if (existsSync(STORE_FILE)) {
      rmSync(STORE_FILE);
    }
  });

  afterEach(() => {
    if (existsSync(STORE_FILE)) {
      rmSync(STORE_FILE);
    }
  });

  it("accepts exactly the original Chat and accepted Skill Run pairs", () => {
    expect(isSessionClassification(CHAT_SESSION_CLASSIFICATION)).toBe(true);
    expect(isSessionClassification(SKILL_RUN_SESSION_CLASSIFICATION)).toBe(true);
    expect(isSessionClassification({ sessionKind: "chat", executionProvider: "skill-run" })).toBe(false);
    expect(isSessionClassification({ sessionKind: "work", executionProvider: "hermes-chat" })).toBe(false);
    expect(isSessionClassification({ sessionKind: "expert", executionProvider: "hermes-task" })).toBe(false);
  });

  it("derives a stable opaque scope without retaining endpoint-like input", () => {
    const first = createSessionScope("remote:https://example.test/api|default");
    expect(first).toBe(createSessionScope("remote:https://example.test/api|default"));
    expect(first).not.toBe(createSessionScope("ssh:host-a|default"));
    expect(first).toMatch(/^scope_[a-f0-9]{64}$/);
    expect(first).not.toContain("example");
  });

  it("retains one idempotent scoped row and lets accepted Skill Run evidence win", () => {
    const { db, raw } = openDb();
    const identity = { sessionScope: createSessionScope("local|default"), profileId: "default", sessionId: "s-1" };
    expect(ensureChatSessionMetadata(db, identity)).toMatchObject(CHAT_SESSION_CLASSIFICATION);
    expect(ensureChatSessionMetadata(db, identity)).toMatchObject(CHAT_SESSION_CLASSIFICATION);
    expect(ensureSkillRunSessionMetadata(db, identity)).toMatchObject(SKILL_RUN_SESSION_CLASSIFICATION);
    expect(ensureChatSessionMetadata(db, identity)).toMatchObject(SKILL_RUN_SESSION_CLASSIFICATION);
    expect(getSessionMetadata(db, identity)).toMatchObject(SKILL_RUN_SESSION_CLASSIFICATION);
    expect(raw.rows()).toHaveLength(1);
  });

  it("rejects malformed identities and never stores the trusted descriptor", () => {
    const { db, raw } = openDb();
    const descriptor = "remote:https://example.test/api?token=do-not-store";
    expect(() => upsertSessionMetadata(db, { sessionScope: descriptor, profileId: "default", sessionId: "s-1" }, CHAT_SESSION_CLASSIFICATION)).toThrow("SESSION_METADATA_IDENTITY_REQUIRED");
    upsertSessionMetadata(db, { sessionScope: createSessionScope(descriptor), profileId: "default", sessionId: "s-1" }, CHAT_SESSION_CLASSIFICATION);
    expect(JSON.stringify(raw.rows())).not.toContain("example.test");
    expect(JSON.stringify(raw.rows())).not.toContain("do-not-store");
  });

  it("keeps accepted work/skill-run classification after feature-mode rollback and re-enable", () => {
    const { db } = openDb();
    const identity = {
      sessionScope: createSessionScope("local|default"),
      profileId: "default",
      sessionId: "s-rollback",
    };
    expect(ensureSkillRunSessionMetadata(db, identity)).toMatchObject(
      SKILL_RUN_SESSION_CLASSIFICATION,
    );
    setSkillRunFeatureMode("expert-compat");
    setSkillRunFeatureMode("local-only");
    expect(getSessionMetadata(db, identity)).toMatchObject(
      SKILL_RUN_SESSION_CLASSIFICATION,
    );
    setSkillRunFeatureMode("skill-first");
    expect(getSessionMetadata(db, identity)).toMatchObject(
      SKILL_RUN_SESSION_CLASSIFICATION,
    );
  });
});
