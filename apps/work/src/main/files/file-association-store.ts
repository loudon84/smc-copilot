/**
 * SQLite persistence for managed files, associations, parsed docs, and chunks.
 * Uses a dedicated file-index.db under the profile files layout (not state.db).
 */

import Database from "better-sqlite3";
import type {
  FileAssociation,
  ManagedFile,
  ParsedDocument,
  ParsedSection,
} from "../../shared/files";
import { ensureFilesLayout } from "./file-store";

export interface FileChunkRow {
  id: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  tokenCount?: number;
  metadata: Record<string, string | number | boolean>;
}

export interface FileChunkSearchHit {
  fileId: string;
  chunkIndex: number;
  content: string;
  score: number;
}

type DbHandle = Database.Database;

const dbCache = new Map<string, DbHandle>();

export function normalizeProfileId(profileId?: string | null): string {
  if (profileId == null || profileId.trim() === "") return "default";
  return profileId.trim();
}

function migrateSchema(db: DbHandle): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS managed_files (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      extension TEXT NOT NULL,
      mime TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      size INTEGER NOT NULL,
      original_path TEXT,
      managed_path TEXT,
      content_hash TEXT,
      parser_id TEXT,
      parse_version INTEGER,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_files_profile_hash
      ON managed_files(profile_id, content_hash);

    CREATE TABLE IF NOT EXISTS file_associations (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      session_id TEXT,
      message_id TEXT,
      task_id TEXT,
      role TEXT NOT NULL,
      ordinal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(file_id) REFERENCES managed_files(id)
    );

    CREATE INDEX IF NOT EXISTS idx_file_associations_session
      ON file_associations(profile_id, session_id);

    CREATE INDEX IF NOT EXISTS idx_file_associations_message
      ON file_associations(profile_id, message_id);

    CREATE TABLE IF NOT EXISTS parsed_documents (
      file_id TEXT PRIMARY KEY,
      parser_id TEXT NOT NULL,
      parser_version INTEGER NOT NULL,
      title TEXT,
      text_content TEXT NOT NULL,
      language TEXT,
      page_count INTEGER,
      sheet_count INTEGER,
      slide_count INTEGER,
      metadata_json TEXT NOT NULL,
      sections_json TEXT NOT NULL,
      truncated INTEGER NOT NULL DEFAULT 0,
      parsed_at TEXT NOT NULL,
      FOREIGN KEY(file_id) REFERENCES managed_files(id)
    );

    CREATE TABLE IF NOT EXISTS file_chunks (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      metadata_json TEXT NOT NULL,
      FOREIGN KEY(file_id) REFERENCES managed_files(id),
      UNIQUE(file_id, chunk_index)
    );
  `);

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_chunks_fts
      USING fts5(
        chunk_id UNINDEXED,
        file_id UNINDEXED,
        content,
        tokenize = 'unicode61'
      );
    `);
  } catch {
    // FTS5 unavailable — searchChunks falls back to LIKE.
  }
}

export function openFileIndexDb(profile?: string): DbHandle {
  const { dbPath } = ensureFilesLayout(profile);
  const cached = dbCache.get(dbPath);
  if (cached) return cached;

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrateSchema(db);
  dbCache.set(dbPath, db);
  return db;
}

export function closeFileIndexDb(profile?: string): void {
  const { dbPath } = ensureFilesLayout(profile);
  const db = dbCache.get(dbPath);
  if (!db) return;
  try {
    db.close();
  } catch {
    // ignore
  }
  dbCache.delete(dbPath);
}

function rowToManagedFile(row: Record<string, unknown>): ManagedFile {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    name: String(row.name),
    extension: String(row.extension),
    mime: String(row.mime),
    category: row.category as ManagedFile["category"],
    source: row.source as ManagedFile["source"],
    status: row.status as ManagedFile["status"],
    size: Number(row.size) || 0,
    originalPath: row.original_path != null ? String(row.original_path) : undefined,
    managedPath: row.managed_path != null ? String(row.managed_path) : undefined,
    contentHash: row.content_hash != null ? String(row.content_hash) : undefined,
    parserId: row.parser_id != null ? String(row.parser_id) : undefined,
    parseVersion:
      row.parse_version != null ? Number(row.parse_version) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    errorCode: row.error_code != null ? String(row.error_code) : undefined,
    errorMessage:
      row.error_message != null ? String(row.error_message) : undefined,
  };
}

function rowToAssociation(row: Record<string, unknown>): FileAssociation {
  return {
    id: String(row.id),
    fileId: String(row.file_id),
    profileId: String(row.profile_id),
    sessionId: row.session_id != null ? String(row.session_id) : undefined,
    messageId: row.message_id != null ? String(row.message_id) : undefined,
    taskId: row.task_id != null ? String(row.task_id) : undefined,
    role: row.role as FileAssociation["role"],
    ordinal: Number(row.ordinal) || 0,
    createdAt: String(row.created_at),
  };
}

export function upsertManagedFile(file: ManagedFile): void {
  const profileId = normalizeProfileId(file.profileId);
  const db = openFileIndexDb(profileId === "default" ? undefined : profileId);
  db.prepare(
    `INSERT INTO managed_files (
      id, profile_id, name, extension, mime, category, source, status, size,
      original_path, managed_path, content_hash, parser_id, parse_version,
      error_code, error_message, created_at, updated_at
    ) VALUES (
      @id, @profile_id, @name, @extension, @mime, @category, @source, @status, @size,
      @original_path, @managed_path, @content_hash, @parser_id, @parse_version,
      @error_code, @error_message, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      profile_id = excluded.profile_id,
      name = excluded.name,
      extension = excluded.extension,
      mime = excluded.mime,
      category = excluded.category,
      source = excluded.source,
      status = excluded.status,
      size = excluded.size,
      original_path = excluded.original_path,
      managed_path = excluded.managed_path,
      content_hash = excluded.content_hash,
      parser_id = excluded.parser_id,
      parse_version = excluded.parse_version,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at`,
  ).run({
    id: file.id,
    profile_id: profileId,
    name: file.name,
    extension: file.extension,
    mime: file.mime,
    category: file.category,
    source: file.source,
    status: file.status,
    size: file.size,
    original_path: file.originalPath ?? null,
    managed_path: file.managedPath ?? null,
    content_hash: file.contentHash ?? null,
    parser_id: file.parserId ?? null,
    parse_version: file.parseVersion ?? null,
    error_code: file.errorCode ?? null,
    error_message: file.errorMessage ?? null,
    created_at: file.createdAt,
    updated_at: file.updatedAt,
  });
}

export function getManagedFile(
  profileId: string,
  fileId: string,
): ManagedFile | null {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const row = db
    .prepare(
      `SELECT * FROM managed_files WHERE profile_id = ? AND id = ? LIMIT 1`,
    )
    .get(pid, fileId) as Record<string, unknown> | undefined;
  return row ? rowToManagedFile(row) : null;
}

export function findByHash(
  profileId: string,
  hash: string,
): ManagedFile | null {
  if (!hash) return null;
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const row = db
    .prepare(
      `SELECT * FROM managed_files
       WHERE profile_id = ? AND content_hash = ?
       LIMIT 1`,
    )
    .get(pid, hash) as Record<string, unknown> | undefined;
  return row ? rowToManagedFile(row) : null;
}

export function listBySession(
  profileId: string,
  sessionId: string,
): Array<ManagedFile & { association: FileAssociation }> {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const rows = db
    .prepare(
      `SELECT
         f.*,
         a.id AS a_id,
         a.file_id AS a_file_id,
         a.profile_id AS a_profile_id,
         a.session_id AS a_session_id,
         a.message_id AS a_message_id,
         a.task_id AS a_task_id,
         a.role AS a_role,
         a.ordinal AS a_ordinal,
         a.created_at AS a_created_at
       FROM file_associations a
       INNER JOIN managed_files f ON f.id = a.file_id
       WHERE a.profile_id = ? AND a.session_id = ?
       ORDER BY a.ordinal ASC, a.created_at ASC`,
    )
    .all(pid, sessionId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const file = rowToManagedFile(row);
    const association = rowToAssociation({
      id: row.a_id,
      file_id: row.a_file_id,
      profile_id: row.a_profile_id,
      session_id: row.a_session_id,
      message_id: row.a_message_id,
      task_id: row.a_task_id,
      role: row.a_role,
      ordinal: row.a_ordinal,
      created_at: row.a_created_at,
    });
    return { ...file, association };
  });
}

export function insertAssociation(assoc: FileAssociation): void {
  const profileId = normalizeProfileId(assoc.profileId);
  const db = openFileIndexDb(profileId === "default" ? undefined : profileId);
  db.prepare(
    `INSERT INTO file_associations (
      id, file_id, profile_id, session_id, message_id, task_id, role, ordinal, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    assoc.id,
    assoc.fileId,
    profileId,
    assoc.sessionId ?? null,
    assoc.messageId ?? null,
    assoc.taskId ?? null,
    assoc.role,
    assoc.ordinal,
    assoc.createdAt,
  );
}

export function deleteAssociation(
  profileId: string,
  associationId: string,
): void {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  db.prepare(
    `DELETE FROM file_associations WHERE profile_id = ? AND id = ?`,
  ).run(pid, associationId);
}

/** Count association rows pointing at a managed file (reference count). */
export function countAssociations(
  fileId: string,
  profileId?: string,
): number {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM file_associations WHERE file_id = ? AND profile_id = ?`,
    )
    .get(fileId, pid) as { n: number } | undefined;
  return Number(row?.n) || 0;
}

/** Find an existing association matching session/file/role (optional message). */
export function findAssociation(opts: {
  profileId: string;
  fileId: string;
  sessionId?: string;
  messageId?: string;
  role: FileAssociation["role"];
}): FileAssociation | null {
  const pid = normalizeProfileId(opts.profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const rows = db
    .prepare(
      `SELECT * FROM file_associations
       WHERE profile_id = ? AND file_id = ? AND role = ?`,
    )
    .all(pid, opts.fileId, opts.role) as Array<Record<string, unknown>>;

  const match = rows.find((row) => {
    const sessionId =
      row.session_id != null ? String(row.session_id) : undefined;
    const messageId =
      row.message_id != null ? String(row.message_id) : undefined;
    if (opts.sessionId !== undefined && sessionId !== opts.sessionId) {
      return false;
    }
    if (opts.messageId !== undefined && messageId !== opts.messageId) {
      return false;
    }
    return true;
  });
  return match ? rowToAssociation(match) : null;
}

/** List managed files associated with a specific message id. */
export function listByMessage(
  profileId: string | undefined,
  messageId: string,
): Array<ManagedFile & { association: FileAssociation }> {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const rows = db
    .prepare(
      `SELECT
         f.*,
         a.id AS a_id,
         a.file_id AS a_file_id,
         a.profile_id AS a_profile_id,
         a.session_id AS a_session_id,
         a.message_id AS a_message_id,
         a.task_id AS a_task_id,
         a.role AS a_role,
         a.ordinal AS a_ordinal,
         a.created_at AS a_created_at
       FROM file_associations a
       INNER JOIN managed_files f ON f.id = a.file_id
       WHERE a.profile_id = ? AND a.message_id = ?
       ORDER BY a.ordinal ASC, a.created_at ASC`,
    )
    .all(pid, messageId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const file = rowToManagedFile(row);
    const association = rowToAssociation({
      id: row.a_id,
      file_id: row.a_file_id,
      profile_id: row.a_profile_id,
      session_id: row.a_session_id,
      message_id: row.a_message_id,
      task_id: row.a_task_id,
      role: row.a_role,
      ordinal: row.a_ordinal,
      created_at: row.a_created_at,
    });
    return { ...file, association };
  });
}

/** List chunk rows for a file, ordered by chunk_index. */
export function listChunksForFile(
  fileId: string,
  profileId?: string,
  options?: { limit?: number },
): FileChunkRow[] {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const limit = Math.max(1, options?.limit ?? 50);
  const rows = db
    .prepare(
      `SELECT id, file_id, chunk_index, content, token_count, metadata_json
       FROM file_chunks
       WHERE file_id = ?
       ORDER BY chunk_index ASC
       LIMIT ?`,
    )
    .all(fileId, limit) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    let metadata: Record<string, string | number | boolean> = {};
    try {
      metadata = JSON.parse(String(row.metadata_json || "{}")) as Record<
        string,
        string | number | boolean
      >;
    } catch {
      metadata = {};
    }
    return {
      id: String(row.id),
      fileId: String(row.file_id),
      chunkIndex: Number(row.chunk_index) || 0,
      content: String(row.content ?? ""),
      tokenCount:
        row.token_count != null ? Number(row.token_count) : undefined,
      metadata,
    };
  });
}

/** Managed files with a managed_path and zero associations, older than cutoff. */
export function listOrphanManagedFiles(
  profileId: string,
  olderThanIso: string,
): ManagedFile[] {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const rows = db
    .prepare(
      `SELECT f.*
       FROM managed_files f
       WHERE f.profile_id = ?
         AND f.managed_path IS NOT NULL
         AND f.managed_path != ''
         AND f.updated_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM file_associations a WHERE a.file_id = f.id
         )`,
    )
    .all(pid, olderThanIso) as Array<Record<string, unknown>>;
  return rows.map(rowToManagedFile);
}

/** Delete a managed file row and its parsed/chunk data (associations must be gone). */
export function deleteManagedFileRecord(
  profileId: string,
  fileId: string,
): void {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const hasFts = !!(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'file_chunks_fts'`,
      )
      .get() as { name?: string } | undefined
  )?.name;

  const tx = db.transaction(() => {
    const chunkIds = db
      .prepare(`SELECT id FROM file_chunks WHERE file_id = ?`)
      .all(fileId) as Array<{ id: string }>;
    if (hasFts) {
      for (const row of chunkIds) {
        db.prepare(`DELETE FROM file_chunks_fts WHERE chunk_id = ?`).run(
          row.id,
        );
      }
    }
    db.prepare(`DELETE FROM file_chunks WHERE file_id = ?`).run(fileId);
    db.prepare(`DELETE FROM parsed_documents WHERE file_id = ?`).run(fileId);
    db.prepare(
      `DELETE FROM managed_files WHERE profile_id = ? AND id = ?`,
    ).run(pid, fileId);
  });
  tx();
}

export function upsertParsedDocument(doc: ParsedDocument): void {
  // Profile is not on ParsedDocument; open via any existing file row lookup
  // by scanning default layout when needed — store against the file's profile.
  const fileRow = findFileProfile(doc.fileId);
  const profileKey = fileRow ?? "default";
  const db = openFileIndexDb(profileKey === "default" ? undefined : profileKey);

  db.prepare(
    `INSERT INTO parsed_documents (
      file_id, parser_id, parser_version, title, text_content, language,
      page_count, sheet_count, slide_count, metadata_json, sections_json,
      truncated, parsed_at
    ) VALUES (
      @file_id, @parser_id, @parser_version, @title, @text_content, @language,
      @page_count, @sheet_count, @slide_count, @metadata_json, @sections_json,
      @truncated, @parsed_at
    )
    ON CONFLICT(file_id) DO UPDATE SET
      parser_id = excluded.parser_id,
      parser_version = excluded.parser_version,
      title = excluded.title,
      text_content = excluded.text_content,
      language = excluded.language,
      page_count = excluded.page_count,
      sheet_count = excluded.sheet_count,
      slide_count = excluded.slide_count,
      metadata_json = excluded.metadata_json,
      sections_json = excluded.sections_json,
      truncated = excluded.truncated,
      parsed_at = excluded.parsed_at`,
  ).run({
    file_id: doc.fileId,
    parser_id: doc.parserId,
    parser_version: doc.parserVersion,
    title: doc.title ?? null,
    text_content: doc.text,
    language: doc.language ?? null,
    page_count: doc.pageCount ?? null,
    sheet_count: doc.sheetCount ?? null,
    slide_count: doc.slideCount ?? null,
    metadata_json: JSON.stringify(doc.metadata ?? {}),
    sections_json: JSON.stringify(doc.sections ?? []),
    truncated: doc.truncated ? 1 : 0,
    parsed_at: doc.parsedAt,
  });
}

function findFileProfile(fileId: string): string | null {
  // Prefer the default profile DB first, then we rely on callers having
  // already written the managed file into the correct profile DB.
  for (const db of dbCache.values()) {
    const row = db
      .prepare(`SELECT profile_id FROM managed_files WHERE id = ? LIMIT 1`)
      .get(fileId) as { profile_id?: string } | undefined;
    if (row?.profile_id) return normalizeProfileId(row.profile_id);
  }
  // Open default DB and check.
  const db = openFileIndexDb();
  const row = db
    .prepare(`SELECT profile_id FROM managed_files WHERE id = ? LIMIT 1`)
    .get(fileId) as { profile_id?: string } | undefined;
  return row?.profile_id ? normalizeProfileId(row.profile_id) : null;
}

export function getParsedDocument(fileId: string): ParsedDocument | null {
  const profileKey = findFileProfile(fileId) ?? "default";
  const db = openFileIndexDb(profileKey === "default" ? undefined : profileKey);
  const row = db
    .prepare(`SELECT * FROM parsed_documents WHERE file_id = ? LIMIT 1`)
    .get(fileId) as Record<string, unknown> | undefined;
  if (!row) return null;

  let sections: ParsedSection[] = [];
  let metadata: Record<string, string | number | boolean> = {};
  try {
    sections = JSON.parse(String(row.sections_json || "[]")) as ParsedSection[];
  } catch {
    sections = [];
  }
  try {
    metadata = JSON.parse(String(row.metadata_json || "{}")) as Record<
      string,
      string | number | boolean
    >;
  } catch {
    metadata = {};
  }

  return {
    fileId: String(row.file_id),
    parserId: String(row.parser_id),
    parserVersion: Number(row.parser_version) || 0,
    title: row.title != null ? String(row.title) : undefined,
    text: String(row.text_content ?? ""),
    language: row.language != null ? String(row.language) : undefined,
    pageCount: row.page_count != null ? Number(row.page_count) : undefined,
    sheetCount: row.sheet_count != null ? Number(row.sheet_count) : undefined,
    slideCount: row.slide_count != null ? Number(row.slide_count) : undefined,
    sections,
    metadata,
    truncated: Number(row.truncated) === 1,
    parsedAt: String(row.parsed_at),
  };
}

function ftsAvailable(db: DbHandle): boolean {
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'file_chunks_fts'`,
    )
    .get() as { name?: string } | undefined;
  return !!row?.name;
}

export function insertChunks(chunks: FileChunkRow[], profileId?: string): void {
  if (chunks.length === 0) return;
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const insertChunk = db.prepare(
    `INSERT INTO file_chunks (id, file_id, chunk_index, content, token_count, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_id, chunk_index) DO UPDATE SET
       id = excluded.id,
       content = excluded.content,
       token_count = excluded.token_count,
       metadata_json = excluded.metadata_json`,
  );
  const hasFts = ftsAvailable(db);
  const deleteFts = hasFts
    ? db.prepare(`DELETE FROM file_chunks_fts WHERE chunk_id = ?`)
    : null;
  const insertFts = hasFts
    ? db.prepare(
        `INSERT INTO file_chunks_fts (chunk_id, file_id, content) VALUES (?, ?, ?)`,
      )
    : null;

  const tx = db.transaction((rows: FileChunkRow[]) => {
    for (const chunk of rows) {
      insertChunk.run(
        chunk.id,
        chunk.fileId,
        chunk.chunkIndex,
        chunk.content,
        chunk.tokenCount ?? null,
        JSON.stringify(chunk.metadata ?? {}),
      );
      if (deleteFts && insertFts) {
        deleteFts.run(chunk.id);
        insertFts.run(chunk.id, chunk.fileId, chunk.content);
      }
    }
  });
  tx(chunks);
}

export function searchChunks(
  profileId: string,
  query: string,
  options?: { fileId?: string; maxResults?: number },
): FileChunkSearchHit[] {
  const q = (query || "").trim();
  if (!q) return [];
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const limit = Math.max(1, options?.maxResults ?? 20);

  if (ftsAvailable(db)) {
    try {
      const ftsQuery = q.replace(/"/g, '""');
      const rows = options?.fileId
        ? (db
            .prepare(
              `SELECT c.file_id AS fileId, c.chunk_index AS chunkIndex, c.content AS content,
                      bm25(file_chunks_fts) AS score
               FROM file_chunks_fts
               INNER JOIN file_chunks c ON c.id = file_chunks_fts.chunk_id
               INNER JOIN managed_files f ON f.id = c.file_id
               WHERE file_chunks_fts MATCH ? AND f.profile_id = ? AND c.file_id = ?
               ORDER BY score
               LIMIT ?`,
            )
            .all(`"${ftsQuery}"`, pid, options.fileId, limit) as FileChunkSearchHit[])
        : (db
            .prepare(
              `SELECT c.file_id AS fileId, c.chunk_index AS chunkIndex, c.content AS content,
                      bm25(file_chunks_fts) AS score
               FROM file_chunks_fts
               INNER JOIN file_chunks c ON c.id = file_chunks_fts.chunk_id
               INNER JOIN managed_files f ON f.id = c.file_id
               WHERE file_chunks_fts MATCH ? AND f.profile_id = ?
               ORDER BY score
               LIMIT ?`,
            )
            .all(`"${ftsQuery}"`, pid, limit) as FileChunkSearchHit[]);
      return rows.map((r) => ({
        fileId: String(r.fileId),
        chunkIndex: Number(r.chunkIndex),
        content: String(r.content),
        score: Number(r.score) || 0,
      }));
    } catch {
      // Fall through to LIKE.
    }
  }

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = options?.fileId
    ? (db
        .prepare(
          `SELECT c.file_id AS fileId, c.chunk_index AS chunkIndex, c.content AS content, 0 AS score
           FROM file_chunks c
           INNER JOIN managed_files f ON f.id = c.file_id
           WHERE f.profile_id = ? AND c.file_id = ? AND c.content LIKE ?
           ORDER BY c.chunk_index
           LIMIT ?`,
        )
        .all(pid, options.fileId, like, limit) as FileChunkSearchHit[])
    : (db
        .prepare(
          `SELECT c.file_id AS fileId, c.chunk_index AS chunkIndex, c.content AS content, 0 AS score
           FROM file_chunks c
           INNER JOIN managed_files f ON f.id = c.file_id
           WHERE f.profile_id = ? AND c.content LIKE ?
           ORDER BY c.chunk_index
           LIMIT ?`,
        )
        .all(pid, like, limit) as FileChunkSearchHit[]);

  return rows.map((r) => ({
    fileId: String(r.fileId),
    chunkIndex: Number(r.chunkIndex),
    content: String(r.content),
    score: Number(r.score) || 0,
  }));
}
