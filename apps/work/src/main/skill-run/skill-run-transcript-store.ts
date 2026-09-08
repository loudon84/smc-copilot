/**
 * Existing Session-owned Skill execution-audit sidecar.
 * Same profile state.db; no history/list/delete IPC.
 */

import type Database from "better-sqlite3";
import { getDbConnection } from "../db";
import type {
  SkillRunActivityItem,
  SkillRunActivityKind,
  SkillRunArtifactDescriptor,
  SkillRunLocalPhase,
  SkillRunToolCallStatus,
} from "../../shared/skill-run";
import type {
  SkillRunDurableActivityRecord,
  SkillRunDurableRunSnapshot,
} from "./skill-run-service";

const RUN_TABLE = "skill_run_transcript_runs";
const ACTIVITY_TABLE = "skill_run_transcript_activities";

const ACTIVITY_KINDS = new Set<SkillRunActivityKind>([
  "reasoning.summary",
  "tool.call",
  "clarify.requested",
  "approval.requested",
]);

const TOOL_STATUSES = new Set<SkillRunToolCallStatus>([
  "started",
  "completed",
  "failed",
]);

const FORBIDDEN_KEY = /^(headers?|endpoint|authorization|auth|token|arguments?|output|bytes|url|path|raw)/i;

export class SkillRunTranscriptUnavailableError extends Error {
  constructor(message = "SKILL_RUN_TRANSCRIPT_UNAVAILABLE") {
    super(message);
    this.name = "SkillRunTranscriptUnavailableError";
  }
}

export interface SkillRunTranscriptRunRow {
  clientRequestId: string;
  sessionId: string;
  profileId: string;
  toolName: string;
  prompt: string;
  providerRunId: string | null;
  phase: SkillRunLocalPhase;
  displayStage: string;
  lastEventId: string | null;
  eventSeq: number;
  text?: string;
  errorCode?: string;
  errorMessage?: string;
  artifacts?: SkillRunArtifactDescriptor[];
  createdAt: string;
  updatedAt: string;
  auditComplete: boolean;
}

export interface SkillRunTranscriptSessionBatch {
  runs: SkillRunTranscriptRunRow[];
  activities: StoredActivity[];
}

interface StoredActivity extends SkillRunActivityItem {
  clientRequestId: string;
  ordinal: number;
}

function ensureTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${RUN_TABLE} (
      client_request_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      provider_run_id TEXT,
      phase TEXT NOT NULL,
      display_stage TEXT NOT NULL,
      last_event_id TEXT,
      event_seq INTEGER NOT NULL DEFAULT 0,
      result_text TEXT,
      error_code TEXT,
      error_message TEXT,
      artifacts_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      audit_complete INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_${RUN_TABLE}_session
      ON ${RUN_TABLE}(session_id, updated_at, client_request_id);
    CREATE TABLE IF NOT EXISTS ${ACTIVITY_TABLE} (
      client_request_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT,
      tool_name TEXT,
      call_id TEXT,
      status TEXT,
      question TEXT,
      options_json TEXT,
      approval_id TEXT,
      PRIMARY KEY (client_request_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_${ACTIVITY_TABLE}_session
      ON ${ACTIVITY_TABLE}(session_id, client_request_id, ordinal);
  `);
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function requireWritableDb(): Database.Database {
  const db = getDbConnection(false);
  if (!db) {
    throw new SkillRunTranscriptUnavailableError();
  }
  ensureTables(db);
  return db;
}

function clipText(value: string | undefined, max = 16_384): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function assertNoForbiddenKeys(value: unknown, path = "root"): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoForbiddenKeys(item, `${path}[${index}]`);
    }
    return;
  }
  if (typeof value !== "object") return;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new Error(`SKILL_RUN_TRANSCRIPT_FORBIDDEN_FIELD:${key}`);
    }
    assertNoForbiddenKeys((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

function sanitizeArtifacts(
  artifacts: SkillRunArtifactDescriptor[] | undefined,
): SkillRunArtifactDescriptor[] | undefined {
  if (!artifacts?.length) return undefined;
  const out: SkillRunArtifactDescriptor[] = [];
  for (const item of artifacts) {
    if (!item || typeof item !== "object") continue;
    assertNoForbiddenKeys(item);
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const fileName =
      typeof item.file_name === "string" ? item.file_name.trim() : "";
    if (!id || !fileName) continue;
    const next: SkillRunArtifactDescriptor = { id, file_name: fileName };
    if (typeof item.size_bytes === "number") next.size_bytes = item.size_bytes;
    if (typeof item.mime_type === "string") next.mime_type = item.mime_type;
    if (typeof item.sha256 === "string") next.sha256 = item.sha256;
    if (typeof item.preview_supported === "boolean") {
      next.preview_supported = item.preview_supported;
    }
    out.push(next);
  }
  return out.length ? out : undefined;
}

function isActivityKind(value: string): value is SkillRunActivityKind {
  return ACTIVITY_KINDS.has(value as SkillRunActivityKind);
}

function isToolStatus(value: string): value is SkillRunToolCallStatus {
  return TOOL_STATUSES.has(value as SkillRunToolCallStatus);
}

export function upsertSkillRunTranscriptRun(
  snapshot: SkillRunDurableRunSnapshot,
): void {
  assertNoForbiddenKeys(snapshot);
  if (!snapshot.clientRequestId.trim() || !snapshot.sessionId.trim()) {
    throw new Error("SKILL_RUN_TRANSCRIPT_IDENTITY_REQUIRED");
  }
  const db = requireWritableDb();
  const artifacts = sanitizeArtifacts(snapshot.artifacts);
  db.prepare(
    `INSERT INTO ${RUN_TABLE} (
      client_request_id, session_id, profile_id, tool_name, prompt,
      provider_run_id, phase, display_stage, last_event_id, event_seq,
      result_text, error_code, error_message, artifacts_json,
      created_at, updated_at, audit_complete
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_request_id) DO UPDATE SET
      session_id = excluded.session_id,
      profile_id = excluded.profile_id,
      tool_name = excluded.tool_name,
      prompt = excluded.prompt,
      provider_run_id = excluded.provider_run_id,
      phase = excluded.phase,
      display_stage = excluded.display_stage,
      last_event_id = excluded.last_event_id,
      event_seq = excluded.event_seq,
      result_text = excluded.result_text,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      artifacts_json = excluded.artifacts_json,
      updated_at = excluded.updated_at,
      audit_complete = excluded.audit_complete`,
  ).run(
    snapshot.clientRequestId,
    snapshot.sessionId,
    snapshot.profileId,
    snapshot.toolName,
    snapshot.prompt,
    snapshot.providerRunId,
    snapshot.phase,
    snapshot.displayStage,
    snapshot.lastEventId,
    snapshot.eventSeq,
    clipText(snapshot.text) ?? null,
    clipText(snapshot.errorCode, 128) ?? null,
    clipText(snapshot.errorMessage, 512) ?? null,
    artifacts ? JSON.stringify(artifacts) : null,
    snapshot.createdAt,
    snapshot.updatedAt,
    snapshot.auditComplete ? 1 : 0,
  );
}

export function appendSkillRunTranscriptActivity(
  record: SkillRunDurableActivityRecord,
): void {
  assertNoForbiddenKeys(record);
  if (
    !record.clientRequestId.trim() ||
    !record.eventId.trim() ||
    !record.sessionId.trim()
  ) {
    throw new Error("SKILL_RUN_TRANSCRIPT_IDENTITY_REQUIRED");
  }
  if (!isActivityKind(record.kind)) {
    return;
  }
  const db = requireWritableDb();
  db.prepare(
    `INSERT OR IGNORE INTO ${ACTIVITY_TABLE} (
      client_request_id, event_id, session_id, ordinal, kind, summary,
      tool_name, call_id, status, question, options_json, approval_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.clientRequestId,
    record.eventId,
    record.sessionId,
    record.ordinal,
    record.kind,
    clipText(record.summary, 512) ?? null,
    clipText(record.toolName, 128) ?? null,
    clipText(record.callId, 128) ?? null,
    record.status && isToolStatus(record.status) ? record.status : null,
    clipText(record.question, 512) ?? null,
    record.options?.length ? JSON.stringify(record.options.slice(0, 8)) : null,
    clipText(record.approvalId, 128) ?? null,
  );
}

export function listSkillRunTranscriptForSession(
  sessionId: string,
): SkillRunTranscriptSessionBatch {
  if (!sessionId.trim()) return { runs: [], activities: [] };
  const db = getDbConnection(true) ?? getDbConnection(false);
  if (!db) return { runs: [], activities: [] };
  if (!tableExists(db, RUN_TABLE) && !tableExists(db, ACTIVITY_TABLE)) {
    return { runs: [], activities: [] };
  }
  const runRows = tableExists(db, RUN_TABLE)
    ? (db
        .prepare(
          `SELECT * FROM ${RUN_TABLE}
           WHERE session_id = ?
           ORDER BY updated_at ASC, client_request_id ASC`,
        )
        .all(sessionId) as Array<Record<string, unknown>>)
    : [];
  const activityRows = tableExists(db, ACTIVITY_TABLE)
    ? (db
        .prepare(
          `SELECT * FROM ${ACTIVITY_TABLE}
           WHERE session_id = ?
           ORDER BY client_request_id ASC, ordinal ASC, event_id ASC`,
        )
        .all(sessionId) as Array<Record<string, unknown>>)
    : [];
  return {
    runs: runRows.map(mapRunRow),
    activities: activityRows.map(mapActivityRow),
  };
}

export function deleteSkillRunTranscriptForSession(
  db: Database.Database,
  sessionId: string,
): void {
  if (!sessionId.trim()) return;
  if (tableExists(db, ACTIVITY_TABLE)) {
    db.prepare(`DELETE FROM ${ACTIVITY_TABLE} WHERE session_id = ?`).run(
      sessionId,
    );
  }
  if (tableExists(db, RUN_TABLE)) {
    db.prepare(`DELETE FROM ${RUN_TABLE} WHERE session_id = ?`).run(sessionId);
  }
}

function mapRunRow(row: Record<string, unknown>): SkillRunTranscriptRunRow {
  let artifacts: SkillRunArtifactDescriptor[] | undefined;
  if (typeof row.artifacts_json === "string" && row.artifacts_json) {
    try {
      artifacts = sanitizeArtifacts(JSON.parse(row.artifacts_json));
    } catch {
      artifacts = undefined;
    }
  }
  return {
    clientRequestId: String(row.client_request_id),
    sessionId: String(row.session_id),
    profileId: String(row.profile_id),
    toolName: String(row.tool_name),
    prompt: String(row.prompt),
    providerRunId:
      typeof row.provider_run_id === "string" && row.provider_run_id
        ? row.provider_run_id
        : null,
    phase: row.phase as SkillRunLocalPhase,
    displayStage: String(row.display_stage ?? ""),
    lastEventId:
      typeof row.last_event_id === "string" ? row.last_event_id : null,
    eventSeq: Number(row.event_seq) || 0,
    text: typeof row.result_text === "string" ? row.result_text : undefined,
    errorCode: typeof row.error_code === "string" ? row.error_code : undefined,
    errorMessage:
      typeof row.error_message === "string" ? row.error_message : undefined,
    artifacts,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    auditComplete: Number(row.audit_complete) === 1,
  };
}

function mapActivityRow(row: Record<string, unknown>): StoredActivity {
  let options: string[] | undefined;
  if (typeof row.options_json === "string" && row.options_json) {
    try {
      const parsed = JSON.parse(row.options_json);
      if (Array.isArray(parsed)) {
        options = parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      options = undefined;
    }
  }
  const kind = String(row.kind);
  const item: StoredActivity = {
    clientRequestId: String(row.client_request_id),
    eventId: String(row.event_id),
    ordinal: Number(row.ordinal) || 0,
    kind: isActivityKind(kind) ? kind : "reasoning.summary",
  };
  if (typeof row.summary === "string") item.summary = row.summary;
  if (typeof row.tool_name === "string") item.toolName = row.tool_name;
  if (typeof row.call_id === "string") item.callId = row.call_id;
  const status = typeof row.status === "string" ? row.status : "";
  if (isToolStatus(status)) item.status = status;
  if (typeof row.question === "string") item.question = row.question;
  if (options?.length) item.options = options;
  if (typeof row.approval_id === "string") item.approvalId = row.approval_id;
  return item;
}

export const SKILL_RUN_TRANSCRIPT_TABLES = {
  runs: RUN_TABLE,
  activities: ACTIVITY_TABLE,
} as const;
