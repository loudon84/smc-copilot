import { createHash } from "crypto";
import type Database from "better-sqlite3";
import { getDbConnection } from "./db";

const TABLE = "desktop_session_metadata";

export type SessionKind = "chat" | "work" | "kb-set";
export type ExecutionProvider = "hermes-chat" | "skill-run";

export interface SessionClassification {
  sessionKind: SessionKind;
  executionProvider: ExecutionProvider;
}

export interface SessionMetadataIdentity {
  sessionScope: string;
  profileId: string;
  sessionId: string;
}

export interface SessionMetadata
  extends SessionMetadataIdentity, SessionClassification {
  knowledgeSetId: string | null;
}

export const CHAT_SESSION_CLASSIFICATION: SessionClassification = {
  sessionKind: "chat",
  executionProvider: "hermes-chat",
};
export const SKILL_RUN_SESSION_CLASSIFICATION: SessionClassification = {
  sessionKind: "work",
  executionProvider: "skill-run",
};
export const KB_SET_SESSION_CLASSIFICATION: SessionClassification = {
  sessionKind: "kb-set",
  executionProvider: "hermes-chat",
};

export const KNOWLEDGE_SESSION_SCOPE_CONFLICT = "KNOWLEDGE_SESSION_SCOPE_CONFLICT";
export const KNOWLEDGE_BINDING_PERSIST_FAILED = "KNOWLEDGE_BINDING_PERSIST_FAILED";
export const SESSION_METADATA_CLASSIFICATION_INVALID =
  "SESSION_METADATA_CLASSIFICATION_INVALID";
export const SESSION_METADATA_IDENTITY_REQUIRED =
  "SESSION_METADATA_IDENTITY_REQUIRED";
export const SESSION_METADATA_KB_SET_REQUIRED = "SESSION_METADATA_KB_SET_REQUIRED";

export function isSessionClassification(
  value: unknown,
): value is SessionClassification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SessionClassification>;
  return (
    (candidate.sessionKind === "chat" &&
      candidate.executionProvider === "hermes-chat") ||
    (candidate.sessionKind === "work" &&
      candidate.executionProvider === "skill-run") ||
    (candidate.sessionKind === "kb-set" &&
      candidate.executionProvider === "hermes-chat")
  );
}

/** Hash a trusted Main-side connection descriptor; descriptors never leave Main. */
export function createSessionScope(trustedDescriptor: string): string {
  const normalized = trustedDescriptor.trim();
  if (!normalized) throw new Error("SESSION_SCOPE_REQUIRED");
  return `scope_${createHash("sha256").update(normalized).digest("hex")}`;
}

function normalizeIdentity(
  identity: SessionMetadataIdentity,
): SessionMetadataIdentity | null {
  const sessionScope = identity.sessionScope?.trim();
  const profileId = identity.profileId?.trim();
  const sessionId = identity.sessionId?.trim();
  if (
    !sessionScope ||
    !profileId ||
    !sessionId ||
    !/^scope_[a-f0-9]{64}$/.test(sessionScope)
  ) {
    return null;
  }
  return { sessionScope, profileId, sessionId };
}

function normalizeKnowledgeSetId(
  knowledgeSetId: string | null | undefined,
  sessionKind: SessionKind,
): string | null {
  if (sessionKind === "kb-set") {
    const trimmed = knowledgeSetId?.trim() ?? "";
    if (!trimmed) throw new Error(SESSION_METADATA_KB_SET_REQUIRED);
    return trimmed;
  }
  if (knowledgeSetId != null && String(knowledgeSetId).trim() !== "") {
    throw new Error(SESSION_METADATA_CLASSIFICATION_INVALID);
  }
  return null;
}

type RawRow = {
  session_kind?: unknown;
  execution_provider?: unknown;
  knowledge_set_id?: unknown;
};

function rowToMetadata(
  normalized: SessionMetadataIdentity,
  row: RawRow,
): SessionMetadata | null {
  const classification = {
    sessionKind: row.session_kind,
    executionProvider: row.execution_provider,
  };
  if (!isSessionClassification(classification)) return null;
  const knowledgeSetId =
    row.knowledge_set_id == null || row.knowledge_set_id === ""
      ? null
      : String(row.knowledge_set_id);
  if (classification.sessionKind === "kb-set") {
    if (!knowledgeSetId?.trim()) return null;
    return { ...normalized, ...classification, knowledgeSetId };
  }
  if (knowledgeSetId) return null;
  return { ...normalized, ...classification, knowledgeSetId: null };
}

function tableExists(db: Database.Database): boolean {
  return Boolean(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(TABLE),
  );
}

function tableHasKnowledgeSetColumn(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(${TABLE})`).all() as Array<{
    name: string;
  }>;
  return cols.some((c) => c.name === "knowledge_set_id");
}

function tableAllowsKbSet(db: Database.Database): boolean {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(TABLE) as { sql?: string } | undefined;
  return Boolean(row?.sql?.includes("'kb-set'"));
}

function tableHasKnowledgeSetColumnOn(
  db: Database.Database,
  tableName: string,
): boolean {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  return cols.some((c) => c.name === "knowledge_set_id");
}

/** Rebuild / create table with kb-set + knowledge_set_id (migration-safe). */
export function ensureTable(db: Database.Database): void {
  const createBody = `(
      session_scope TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_kind TEXT NOT NULL CHECK (session_kind IN ('chat', 'work', 'kb-set')),
      execution_provider TEXT NOT NULL CHECK (execution_provider IN ('hermes-chat', 'skill-run')),
      knowledge_set_id TEXT,
      updated_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (session_scope, profile_id, session_id),
      CHECK (
        (session_kind = 'chat' AND execution_provider = 'hermes-chat' AND knowledge_set_id IS NULL)
        OR (session_kind = 'work' AND execution_provider = 'skill-run' AND knowledge_set_id IS NULL)
        OR (session_kind = 'kb-set' AND execution_provider = 'hermes-chat'
            AND knowledge_set_id IS NOT NULL AND trim(knowledge_set_id) <> '')
      )
    )`;

  if (!tableExists(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} ${createBody}`);
    return;
  }

  if (tableHasKnowledgeSetColumn(db) && tableAllowsKbSet(db)) {
    return;
  }

  db.exec(`ALTER TABLE ${TABLE} RENAME TO ${TABLE}_old`);
  db.exec(`CREATE TABLE ${TABLE} ${createBody}`);
  const hasOldKs = (() => {
    try {
      return tableHasKnowledgeSetColumnOn(db, `${TABLE}_old`);
    } catch {
      return false;
    }
  })();
  if (hasOldKs) {
    db.exec(`
      INSERT INTO ${TABLE} (session_scope, profile_id, session_id, session_kind, execution_provider, knowledge_set_id, updated_at)
      SELECT session_scope, profile_id, session_id, session_kind, execution_provider, knowledge_set_id, updated_at
      FROM ${TABLE}_old
    `);
  } else {
    db.exec(`
      INSERT INTO ${TABLE} (session_scope, profile_id, session_id, session_kind, execution_provider, knowledge_set_id, updated_at)
      SELECT session_scope, profile_id, session_id, session_kind, execution_provider, NULL, updated_at
      FROM ${TABLE}_old
    `);
  }
  db.exec(`DROP TABLE ${TABLE}_old`);
}

function sameBinding(a: SessionMetadata, b: SessionMetadata): boolean {
  return (
    a.sessionScope === b.sessionScope &&
    a.profileId === b.profileId &&
    a.sessionId === b.sessionId &&
    a.sessionKind === b.sessionKind &&
    a.executionProvider === b.executionProvider &&
    a.knowledgeSetId === b.knowledgeSetId
  );
}

export function upsertSessionMetadata(
  db: Database.Database,
  identity: SessionMetadataIdentity,
  classification: SessionClassification,
  knowledgeSetId: string | null = null,
): SessionMetadata {
  const normalized = normalizeIdentity(identity);
  if (!normalized) throw new Error(SESSION_METADATA_IDENTITY_REQUIRED);
  if (!isSessionClassification(classification)) {
    throw new Error(SESSION_METADATA_CLASSIFICATION_INVALID);
  }
  const ks = normalizeKnowledgeSetId(knowledgeSetId, classification.sessionKind);
  ensureTable(db);

  const existing = getSessionMetadata(db, normalized);
  const next: SessionMetadata = {
    ...normalized,
    ...classification,
    knowledgeSetId: ks,
  };
  if (existing) {
    if (sameBinding(existing, next)) {
      return existing;
    }
    // kb-set rows are immutable; do not overwrite via generic upsert.
    if (
      existing.sessionKind === "kb-set" ||
      classification.sessionKind === "kb-set"
    ) {
      throw new Error(KNOWLEDGE_SESSION_SCOPE_CONFLICT);
    }
    // chat ↔ skill-run force paths keep last-applied semantics.
    try {
      db.prepare(
        `UPDATE ${TABLE}
         SET session_kind = ?, execution_provider = ?, knowledge_set_id = NULL, updated_at = strftime('%s', 'now')
         WHERE session_scope = ? AND profile_id = ? AND session_id = ?`,
      ).run(
        classification.sessionKind,
        classification.executionProvider,
        normalized.sessionScope,
        normalized.profileId,
        normalized.sessionId,
      );
    } catch (err) {
      throw new Error(KNOWLEDGE_BINDING_PERSIST_FAILED, { cause: err });
    }
    const updated = getSessionMetadata(db, normalized);
    if (!updated || !sameBinding(updated, next)) {
      throw new Error(KNOWLEDGE_BINDING_PERSIST_FAILED);
    }
    return updated;
  }

  try {
    db.prepare(
      `INSERT INTO ${TABLE} (session_scope, profile_id, session_id, session_kind, execution_provider, knowledge_set_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))`,
    ).run(
      normalized.sessionScope,
      normalized.profileId,
      normalized.sessionId,
      classification.sessionKind,
      classification.executionProvider,
      ks,
    );
  } catch (err) {
    throw new Error(KNOWLEDGE_BINDING_PERSIST_FAILED, { cause: err });
  }

  const written = getSessionMetadata(db, normalized);
  if (!written || !sameBinding(written, next)) {
    throw new Error(KNOWLEDGE_BINDING_PERSIST_FAILED);
  }
  return written;
}

/**
 * First-create / G4 path: insert kb-set, or upgrade empty chat row once.
 * `messageCount` must be supplied by caller (Hermes sessions.message_count).
 */
export function upsertKbSetSessionMetadata(
  db: Database.Database,
  identity: SessionMetadataIdentity,
  knowledgeSetId: string,
  options: { messageCount?: number } = {},
): SessionMetadata {
  const normalized = normalizeIdentity(identity);
  if (!normalized) throw new Error(SESSION_METADATA_IDENTITY_REQUIRED);
  const ks = normalizeKnowledgeSetId(knowledgeSetId, "kb-set");
  ensureTable(db);

  const existing = getSessionMetadata(db, normalized);
  const next: SessionMetadata = {
    ...normalized,
    ...KB_SET_SESSION_CLASSIFICATION,
    knowledgeSetId: ks,
  };

  if (!existing) {
    return upsertSessionMetadata(
      db,
      normalized,
      KB_SET_SESSION_CLASSIFICATION,
      ks,
    );
  }

  if (sameBinding(existing, next)) {
    return existing;
  }

  if (
    existing.sessionKind === "chat" &&
    existing.executionProvider === "hermes-chat" &&
    (options.messageCount ?? 1) === 0
  ) {
    try {
      db.prepare(
        `UPDATE ${TABLE}
         SET session_kind = ?, execution_provider = ?, knowledge_set_id = ?, updated_at = strftime('%s', 'now')
         WHERE session_scope = ? AND profile_id = ? AND session_id = ?`,
      ).run(
        "kb-set",
        "hermes-chat",
        ks,
        normalized.sessionScope,
        normalized.profileId,
        normalized.sessionId,
      );
    } catch (err) {
      throw new Error(KNOWLEDGE_BINDING_PERSIST_FAILED, { cause: err });
    }
    const written = getSessionMetadata(db, normalized);
    if (!written || !sameBinding(written, next)) {
      throw new Error(KNOWLEDGE_BINDING_PERSIST_FAILED);
    }
    return written;
  }

  throw new Error(KNOWLEDGE_SESSION_SCOPE_CONFLICT);
}

export function getSessionMetadata(
  db: Database.Database,
  identity: SessionMetadataIdentity,
): SessionMetadata | null {
  const normalized = normalizeIdentity(identity);
  if (!normalized || !tableExists(db)) return null;
  ensureTable(db);
  const row = db
    .prepare(
      `SELECT session_kind, execution_provider, knowledge_set_id FROM ${TABLE}
       WHERE session_scope = ? AND profile_id = ? AND session_id = ?`,
    )
    .get(
      normalized.sessionScope,
      normalized.profileId,
      normalized.sessionId,
    ) as RawRow | undefined;
  return row ? rowToMetadata(normalized, row) : null;
}

export function getSessionMetadataBySessionId(
  db: Database.Database,
  sessionId: string,
): SessionMetadata | null {
  const id = sessionId?.trim();
  if (!id || !tableExists(db)) return null;
  ensureTable(db);
  const row = db
    .prepare(
      `SELECT session_scope, profile_id, session_id, session_kind, execution_provider, knowledge_set_id
       FROM ${TABLE} WHERE session_id = ? LIMIT 1`,
    )
    .get(id) as
    | (RawRow & {
        session_scope?: unknown;
        profile_id?: unknown;
        session_id?: unknown;
      })
    | undefined;
  if (!row?.session_scope || !row.profile_id || !row.session_id) return null;
  return rowToMetadata(
    {
      sessionScope: String(row.session_scope),
      profileId: String(row.profile_id),
      sessionId: String(row.session_id),
    },
    row,
  );
}

/** Trusted Chat repair preserves durable Skill Run / kb-set classifications. */
export function ensureChatSessionMetadata(
  db: Database.Database,
  identity: SessionMetadataIdentity,
): SessionMetadata {
  const existing = getSessionMetadata(db, identity);
  if (existing) return existing;
  return upsertSessionMetadata(db, identity, CHAT_SESSION_CLASSIFICATION, null);
}

export function ensureSkillRunSessionMetadata(
  db: Database.Database,
  identity: SessionMetadataIdentity,
): SessionMetadata {
  const existing = getSessionMetadata(db, identity);
  if (existing?.sessionKind === "kb-set") {
    throw new Error(KNOWLEDGE_SESSION_SCOPE_CONFLICT);
  }
  return upsertSessionMetadata(
    db,
    identity,
    SKILL_RUN_SESSION_CLASSIFICATION,
    null,
  );
}

export function deleteSessionMetadataForSession(
  db: Database.Database,
  identity: SessionMetadataIdentity,
): void {
  const normalized = normalizeIdentity(identity);
  if (!normalized || !tableExists(db)) return;
  db.prepare(
    `DELETE FROM ${TABLE} WHERE session_scope = ? AND profile_id = ? AND session_id = ?`,
  ).run(normalized.sessionScope, normalized.profileId, normalized.sessionId);
}

/** Delete every metadata row for a Hermes session_id (any profile). */
export function deleteAllSessionMetadataForSessionId(
  db: Database.Database,
  sessionId: string,
): number {
  const id = sessionId?.trim();
  if (!id || !tableExists(db)) return 0;
  ensureTable(db);
  const result = db.prepare(`DELETE FROM ${TABLE} WHERE session_id = ?`).run(id);
  return Number(result.changes ?? 0);
}

/** Read-only paths fail closed when the active state DB is unavailable. */
export function readSessionMetadata(
  identity: SessionMetadataIdentity,
): SessionMetadata | null {
  const db = getDbConnection(true);
  return db ? getSessionMetadata(db, identity) : null;
}

export function readSessionMetadataBySessionId(
  sessionId: string,
): SessionMetadata | null {
  const db = getDbConnection(true);
  return db ? getSessionMetadataBySessionId(db, sessionId) : null;
}

export function listKbSetSessionIdsForProfile(
  db: Database.Database,
  profileId: string,
): string[] {
  const pid = profileId?.trim();
  if (!pid || !tableExists(db)) return [];
  ensureTable(db);
  const rows = db
    .prepare(
      `SELECT session_id FROM ${TABLE}
       WHERE profile_id = ? AND session_kind = 'kb-set'
       ORDER BY updated_at DESC`,
    )
    .all(pid) as Array<{ session_id: string }>;
  return rows.map((r) => r.session_id);
}
