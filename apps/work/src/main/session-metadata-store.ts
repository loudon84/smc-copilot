import { createHash } from "crypto";
import type Database from "better-sqlite3";
import { getDbConnection } from "./db";

const TABLE = "desktop_session_metadata";

export type SessionKind = "chat" | "work";
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

export interface SessionMetadata extends SessionMetadataIdentity, SessionClassification {}

export const CHAT_SESSION_CLASSIFICATION: SessionClassification = { sessionKind: "chat", executionProvider: "hermes-chat" };
export const SKILL_RUN_SESSION_CLASSIFICATION: SessionClassification = { sessionKind: "work", executionProvider: "skill-run" };

export function isSessionClassification(value: unknown): value is SessionClassification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SessionClassification>;
  return (candidate.sessionKind === "chat" && candidate.executionProvider === "hermes-chat") ||
    (candidate.sessionKind === "work" && candidate.executionProvider === "skill-run");
}

/** Hash a trusted Main-side connection descriptor; descriptors never leave Main. */
export function createSessionScope(trustedDescriptor: string): string {
  const normalized = trustedDescriptor.trim();
  if (!normalized) throw new Error("SESSION_SCOPE_REQUIRED");
  return `scope_${createHash("sha256").update(normalized).digest("hex")}`;
}

function normalizeIdentity(identity: SessionMetadataIdentity): SessionMetadataIdentity | null {
  const sessionScope = identity.sessionScope?.trim();
  const profileId = identity.profileId?.trim();
  const sessionId = identity.sessionId?.trim();
  if (!sessionScope || !profileId || !sessionId || !/^scope_[a-f0-9]{64}$/.test(sessionScope)) return null;
  return { sessionScope, profileId, sessionId };
}

function ensureTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      session_scope TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_kind TEXT NOT NULL CHECK (session_kind IN ('chat', 'work')),
      execution_provider TEXT NOT NULL CHECK (execution_provider IN ('hermes-chat', 'skill-run')),
      updated_at REAL NOT NULL DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (session_scope, profile_id, session_id),
      CHECK ((session_kind = 'chat' AND execution_provider = 'hermes-chat') OR (session_kind = 'work' AND execution_provider = 'skill-run'))
    );
  `);
}

function tableExists(db: Database.Database): boolean {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(TABLE));
}

export function upsertSessionMetadata(db: Database.Database, identity: SessionMetadataIdentity, classification: SessionClassification): SessionMetadata {
  const normalized = normalizeIdentity(identity);
  if (!normalized) throw new Error("SESSION_METADATA_IDENTITY_REQUIRED");
  if (!isSessionClassification(classification)) throw new Error("SESSION_METADATA_CLASSIFICATION_INVALID");
  ensureTable(db);
  db.prepare(`INSERT INTO ${TABLE} (session_scope, profile_id, session_id, session_kind, execution_provider, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(session_scope, profile_id, session_id) DO UPDATE SET
      session_kind = excluded.session_kind, execution_provider = excluded.execution_provider, updated_at = excluded.updated_at`)
    .run(normalized.sessionScope, normalized.profileId, normalized.sessionId, classification.sessionKind, classification.executionProvider);
  return { ...normalized, ...classification };
}

export function getSessionMetadata(db: Database.Database, identity: SessionMetadataIdentity): SessionMetadata | null {
  const normalized = normalizeIdentity(identity);
  if (!normalized || !tableExists(db)) return null;
  const row = db.prepare(`SELECT session_kind, execution_provider FROM ${TABLE}
    WHERE session_scope = ? AND profile_id = ? AND session_id = ?`)
    .get(normalized.sessionScope, normalized.profileId, normalized.sessionId) as { session_kind?: unknown; execution_provider?: unknown } | undefined;
  const classification = row ? { sessionKind: row.session_kind, executionProvider: row.execution_provider } : null;
  return isSessionClassification(classification) ? { ...normalized, ...classification } : null;
}

/** Trusted Chat repair preserves a durable accepted Skill Run classification. */
export function ensureChatSessionMetadata(db: Database.Database, identity: SessionMetadataIdentity): SessionMetadata {
  return getSessionMetadata(db, identity) ?? upsertSessionMetadata(db, identity, CHAT_SESSION_CLASSIFICATION);
}

export function ensureSkillRunSessionMetadata(db: Database.Database, identity: SessionMetadataIdentity): SessionMetadata {
  return upsertSessionMetadata(db, identity, SKILL_RUN_SESSION_CLASSIFICATION);
}

export function deleteSessionMetadataForSession(db: Database.Database, identity: SessionMetadataIdentity): void {
  const normalized = normalizeIdentity(identity);
  if (!normalized || !tableExists(db)) return;
  db.prepare(`DELETE FROM ${TABLE} WHERE session_scope = ? AND profile_id = ? AND session_id = ?`)
    .run(normalized.sessionScope, normalized.profileId, normalized.sessionId);
}

/** Read-only paths fail closed when the active state DB is unavailable. */
export function readSessionMetadata(identity: SessionMetadataIdentity): SessionMetadata | null {
  const db = getDbConnection(true);
  return db ? getSessionMetadata(db, identity) : null;
}
