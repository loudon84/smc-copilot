import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  CHAT_SESSION_CLASSIFICATION,
  KB_SET_SESSION_CLASSIFICATION,
  KNOWLEDGE_SESSION_SCOPE_CONFLICT,
  SKILL_RUN_SESSION_CLASSIFICATION,
  createSessionScope,
  deleteAllSessionMetadataForSessionId,
  ensureChatSessionMetadata,
  ensureSkillRunSessionMetadata,
  getSessionMetadata,
  isSessionClassification,
  upsertKbSetSessionMetadata,
  upsertSessionMetadata,
} from "./session-metadata-store";

type MetadataRow = {
  session_scope: string;
  profile_id: string;
  session_id: string;
  session_kind: string;
  execution_provider: string;
  knowledge_set_id: string | null;
  updated_at: number;
};

class MetadataDb {
  private tableCreated = false;
  private migrated = false;
  private readonly rowsByIdentity = new Map<string, MetadataRow>();

  exec(sql: string): void {
    if (sql.includes("CREATE TABLE")) {
      this.tableCreated = true;
      this.migrated = sql.includes("kb-set");
    }
    if (sql.includes("RENAME TO")) {
      // keep rows
    }
    if (sql.includes("DROP TABLE")) {
      // no-op
    }
  }

  prepare(sql: string): {
    get: (...args: unknown[]) => unknown;
    run: (...args: unknown[]) => { changes: number };
    all: (...args: unknown[]) => unknown[];
  } {
    return {
      get: (...args: unknown[]) => {
        if (sql.includes("sqlite_master") && sql.includes("name = ?")) {
          return this.tableCreated
            ? {
                name: "desktop_session_metadata",
                sql: this.migrated
                  ? "CREATE TABLE desktop_session_metadata (session_kind IN ('chat', 'work', 'kb-set'))"
                  : "CREATE TABLE desktop_session_metadata (session_kind IN ('chat', 'work'))",
              }
            : undefined;
        }
        if (sql.includes("PRAGMA table_info")) {
          return undefined;
        }
        if (sql.includes("FROM desktop_session_metadata") && sql.includes("LIMIT 1")) {
          const sessionId = String(args[0]);
          for (const row of this.rowsByIdentity.values()) {
            if (row.session_id === sessionId) return row;
          }
          return undefined;
        }
        if (sql.includes("FROM desktop_session_metadata")) {
          const [scope, profileId, sessionId] = args.map(String);
          return this.rowsByIdentity.get(`${scope}|${profileId}|${sessionId}`);
        }
        return undefined;
      },
      all: (...args: unknown[]) => {
        if (sql.includes("PRAGMA table_info")) {
          if (!this.tableCreated) return [];
          const cols = [
            { name: "session_scope" },
            { name: "profile_id" },
            { name: "session_id" },
            { name: "session_kind" },
            { name: "execution_provider" },
            { name: "updated_at" },
          ];
          if (this.migrated) cols.push({ name: "knowledge_set_id" });
          return cols;
        }
        if (sql.includes("session_kind = 'kb-set'")) {
          const profileId = String(args[0]);
          return [...this.rowsByIdentity.values()].filter(
            (r) => r.profile_id === profileId && r.session_kind === "kb-set",
          );
        }
        return [];
      },
      run: (...args: unknown[]) => {
        if (sql.includes("DELETE FROM desktop_session_metadata") && sql.includes("session_id = ?") && !sql.includes("session_scope")) {
          const sessionId = String(args[0]);
          let changes = 0;
          for (const [key, row] of this.rowsByIdentity) {
            if (row.session_id === sessionId) {
              this.rowsByIdentity.delete(key);
              changes += 1;
            }
          }
          return { changes };
        }
        if (sql.includes("DELETE FROM desktop_session_metadata")) {
          const [scope, profileId, sessionId] = args.map(String);
          const key = `${scope}|${profileId}|${sessionId}`;
          const existed = this.rowsByIdentity.delete(key);
          return { changes: existed ? 1 : 0 };
        }
        if (sql.includes("UPDATE desktop_session_metadata") || sql.includes(`UPDATE ${"desktop_session_metadata"}`)) {
          // UPDATE ... SET session_kind, execution_provider, knowledge_set_id, WHERE scope, profile, id
          if (args.length === 6) {
            const [kind, provider, ks, scope, profileId, sessionId] = args;
            const key = `${scope}|${profileId}|${sessionId}`;
            const existing = this.rowsByIdentity.get(key);
            if (!existing) return { changes: 0 };
            this.rowsByIdentity.set(key, {
              ...existing,
              session_kind: String(kind),
              execution_provider: String(provider),
              knowledge_set_id: ks == null ? null : String(ks),
              updated_at: Date.now(),
            });
            return { changes: 1 };
          }
          if (args.length === 5) {
            const [kind, provider, scope, profileId, sessionId] = args;
            const key = `${scope}|${profileId}|${sessionId}`;
            const existing = this.rowsByIdentity.get(key);
            if (!existing) return { changes: 0 };
            this.rowsByIdentity.set(key, {
              ...existing,
              session_kind: String(kind),
              execution_provider: String(provider),
              knowledge_set_id: null,
              updated_at: Date.now(),
            });
            return { changes: 1 };
          }
        }
        if (sql.includes("INSERT INTO desktop_session_metadata")) {
          const [
            sessionScope,
            profileId,
            sessionId,
            sessionKind,
            executionProvider,
            knowledgeSetId,
          ] = args;
          this.tableCreated = true;
          this.migrated = true;
          this.rowsByIdentity.set(
            `${sessionScope}|${profileId}|${sessionId}`,
            {
              session_scope: String(sessionScope),
              profile_id: String(profileId),
              session_id: String(sessionId),
              session_kind: String(sessionKind),
              execution_provider: String(executionProvider),
              knowledge_set_id:
                knowledgeSetId == null ? null : String(knowledgeSetId),
              updated_at: Date.now(),
            },
          );
          return { changes: 1 };
        }
        return { changes: 0 };
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
  it("accepts chat, work, and kb-set pairs only", () => {
    expect(isSessionClassification(CHAT_SESSION_CLASSIFICATION)).toBe(true);
    expect(isSessionClassification(SKILL_RUN_SESSION_CLASSIFICATION)).toBe(true);
    expect(isSessionClassification(KB_SET_SESSION_CLASSIFICATION)).toBe(true);
    expect(
      isSessionClassification({
        sessionKind: "chat",
        executionProvider: "skill-run",
      }),
    ).toBe(false);
    expect(
      isSessionClassification({
        sessionKind: "kb-set",
        executionProvider: "skill-run",
      }),
    ).toBe(false);
  });

  it("preserves skill-run over chat ensure", () => {
    const { db } = openDb();
    const identity = {
      sessionScope: createSessionScope("local|default"),
      profileId: "default",
      sessionId: "s-1",
    };
    expect(ensureChatSessionMetadata(db, identity)).toMatchObject(
      CHAT_SESSION_CLASSIFICATION,
    );
    expect(ensureChatSessionMetadata(db, identity)).toMatchObject(
      CHAT_SESSION_CLASSIFICATION,
    );
    expect(ensureSkillRunSessionMetadata(db, identity)).toMatchObject(
      SKILL_RUN_SESSION_CLASSIFICATION,
    );
    expect(ensureChatSessionMetadata(db, identity)).toMatchObject(
      SKILL_RUN_SESSION_CLASSIFICATION,
    );
  });

  it("rejects unhashed session scope", () => {
    const { db } = openDb();
    expect(() =>
      upsertSessionMetadata(
        db,
        {
          sessionScope: "local|default",
          profileId: "default",
          sessionId: "s-1",
        },
        CHAT_SESSION_CLASSIFICATION,
      ),
    ).toThrow("SESSION_METADATA_IDENTITY_REQUIRED");
  });

  it("inserts kb-set with knowledge_set_id and rejects rebind", () => {
    const { db } = openDb();
    const identity = {
      sessionScope: createSessionScope("local|default"),
      profileId: "default",
      sessionId: "s-kb",
    };
    const row = upsertKbSetSessionMetadata(db, identity, "KS-A");
    expect(row).toMatchObject({
      ...KB_SET_SESSION_CLASSIFICATION,
      knowledgeSetId: "KS-A",
    });
    expect(upsertKbSetSessionMetadata(db, identity, "KS-A")).toMatchObject({
      knowledgeSetId: "KS-A",
    });
    expect(() => upsertKbSetSessionMetadata(db, identity, "KS-B")).toThrow(
      KNOWLEDGE_SESSION_SCOPE_CONFLICT,
    );
    expect(getSessionMetadata(db, identity)?.knowledgeSetId).toBe("KS-A");
  });

  it("upgrades empty chat to kb-set once", () => {
    const { db } = openDb();
    const identity = {
      sessionScope: createSessionScope("local|default"),
      profileId: "default",
      sessionId: "s-empty",
    };
    ensureChatSessionMetadata(db, identity);
    const upgraded = upsertKbSetSessionMetadata(db, identity, "KS-A", {
      messageCount: 0,
    });
    expect(upgraded.sessionKind).toBe("kb-set");
    expect(upgraded.knowledgeSetId).toBe("KS-A");
  });

  it("does not upgrade non-empty chat to kb-set", () => {
    const { db } = openDb();
    const identity = {
      sessionScope: createSessionScope("local|default"),
      profileId: "default",
      sessionId: "s-full",
    };
    ensureChatSessionMetadata(db, identity);
    expect(() =>
      upsertKbSetSessionMetadata(db, identity, "KS-A", { messageCount: 2 }),
    ).toThrow(KNOWLEDGE_SESSION_SCOPE_CONFLICT);
  });

  it("ensureChat does not demote kb-set", () => {
    const { db } = openDb();
    const identity = {
      sessionScope: createSessionScope("local|default"),
      profileId: "default",
      sessionId: "s-kb2",
    };
    upsertKbSetSessionMetadata(db, identity, "KS-A");
    expect(ensureChatSessionMetadata(db, identity).sessionKind).toBe("kb-set");
  });

  it("deletes all metadata rows by session_id", () => {
    const { db } = openDb();
    const scopeA = createSessionScope("local|a");
    const scopeB = createSessionScope("local|b");
    upsertKbSetSessionMetadata(
      db,
      { sessionScope: scopeA, profileId: "a", sessionId: "s-del" },
      "KS-A",
    );
    upsertSessionMetadata(
      db,
      { sessionScope: scopeB, profileId: "b", sessionId: "s-del" },
      CHAT_SESSION_CLASSIFICATION,
    );
    expect(deleteAllSessionMetadataForSessionId(db, "s-del")).toBe(2);
    expect(
      getSessionMetadata(db, {
        sessionScope: scopeA,
        profileId: "a",
        sessionId: "s-del",
      }),
    ).toBeNull();
  });
});
