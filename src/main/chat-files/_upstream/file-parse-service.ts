/**
 * File parse orchestration: registry resolve, cache, concurrency, chunking.
 * Parser failures must not block path-ref attachment send (callers catch).
 */

import { randomUUID } from "crypto";
import { existsSync } from "fs";
import type {
  FileParserInput,
  ManagedFile,
  ParsedDocument,
} from "../../shared/files";
import { readDesktopFilesConfig } from "./file-config";
import {
  getManagedFile,
  getParsedDocument,
  insertChunks,
  normalizeProfileId,
  openFileIndexDb,
  upsertManagedFile,
  upsertParsedDocument,
  type FileChunkRow,
} from "./file-association-store";
import {
  FileParserRegistry,
  getDefaultParserRegistry,
} from "./file-parser-registry";
import { FilePlatformError } from "./file-security";
import { chunkText } from "./file-chunking";

export { chunkText } from "./file-chunking";

const MAX_CONCURRENCY_CAP = 2;

class ParseSemaphore {
  private running = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    // Slot transferred from release() — already counted in `running`.
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.running = Math.max(0, this.running - 1);
  }
}

const inflight = new Map<string, Promise<ParsedDocument>>();
let semaphore: ParseSemaphore | null = null;

function getSemaphore(concurrency: number): ParseSemaphore {
  const max = Math.max(1, Math.min(MAX_CONCURRENCY_CAP, concurrency || 2));
  if (!semaphore) {
    semaphore = new ParseSemaphore(max);
  }
  return semaphore;
}

function profileKey(profile?: string): string {
  return normalizeProfileId(profile);
}

function resolvePath(file: ManagedFile): string | null {
  const path = file.managedPath || file.originalPath;
  if (!path || !existsSync(path)) return null;
  return path;
}

function toParserInput(file: ManagedFile, path: string): FileParserInput {
  return {
    fileId: file.id,
    path,
    name: file.name,
    extension: file.extension,
    mime: file.mime,
    size: file.size,
    contentHash: file.contentHash,
  };
}

function touchStatus(
  file: ManagedFile,
  status: ManagedFile["status"],
  extra?: Partial<ManagedFile>,
): ManagedFile {
  const updated: ManagedFile = {
    ...file,
    ...extra,
    status,
    updatedAt: new Date().toISOString(),
  };
  upsertManagedFile(updated);
  return updated;
}

/** Remove prior chunks (+ FTS rows) for a file before re-indexing. */
export function deleteChunksForFile(
  fileId: string,
  profileId?: string,
): void {
  const pid = normalizeProfileId(profileId);
  const db = openFileIndexDb(pid === "default" ? undefined : pid);
  const ids = db
    .prepare(`SELECT id FROM file_chunks WHERE file_id = ?`)
    .all(fileId) as Array<{ id: string }>;

  const hasFts = !!(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'file_chunks_fts'`,
      )
      .get() as { name?: string } | undefined
  )?.name;

  const tx = db.transaction(() => {
    if (hasFts) {
      for (const row of ids) {
        db.prepare(`DELETE FROM file_chunks_fts WHERE chunk_id = ?`).run(
          row.id,
        );
      }
    }
    db.prepare(`DELETE FROM file_chunks WHERE file_id = ?`).run(fileId);
  });
  tx();
}

function indexParsedDocument(
  profile: string,
  doc: ParsedDocument,
  chunkChars: number,
  overlapChars: number,
): void {
  deleteChunksForFile(doc.fileId, profile);
  const parts = chunkText(doc.text, chunkChars, overlapChars);
  const rows: FileChunkRow[] = parts.map((content, chunkIndex) => ({
    id: randomUUID(),
    fileId: doc.fileId,
    chunkIndex,
    content,
    metadata: { parserId: doc.parserId, parserVersion: doc.parserVersion },
  }));
  insertChunks(rows, profile);
}

export interface ParseFileOptions {
  force?: boolean;
  signal?: AbortSignal;
  registry?: FileParserRegistry;
  /**
   * When true, skip the inner ParseSemaphore — the FileJobQueue already
   * bounds concurrency. Direct callers leave this unset.
   */
  skipConcurrency?: boolean;
}

/**
 * Parse a managed file, persist ParsedDocument, and index FTS chunks.
 * Returns cached document when parser id/version still match (unless force).
 */
// @lat: [[file-platform#Parser Registry]]
export async function parseFile(
  profile: string | undefined,
  fileId: string,
  options?: ParseFileOptions,
): Promise<ParsedDocument> {
  const pid = profileKey(profile);
  const config = readDesktopFilesConfig(profile);
  const force = options?.force === true;
  const signal = options?.signal;
  const registry = options?.registry ?? getDefaultParserRegistry();
  const skipConcurrency = options?.skipConcurrency === true;

  if (!config.parsing.enabled && !force) {
    const cached = getParsedDocument(fileId);
    if (cached) return cached;
  }

  const inflightKey = `${pid}:${fileId}:${force ? "force" : "cache"}`;
  const existingJob = inflight.get(inflightKey);
  if (existingJob) return existingJob;

  const job = (async () => {
    const sem = skipConcurrency
      ? null
      : getSemaphore(config.parsing.concurrency);
    if (sem) await sem.acquire();
    try {
      if (signal?.aborted) {
        throw FilePlatformError.fromCode(
          "FILE_PARSE_FAILED",
          "Parse aborted",
          { retryable: true },
        );
      }

      let file = getManagedFile(pid, fileId);
      if (!file) {
        throw FilePlatformError.fromCode(
          "FILE_NOT_FOUND",
          "Managed file not found",
        );
      }

      const path = resolvePath(file);
      if (!path) {
        touchStatus(file, "missing", {
          errorCode: "FILE_NOT_FOUND",
          errorMessage: "File is missing from disk",
        });
        throw FilePlatformError.fromCode(
          "FILE_NOT_FOUND",
          "File is missing from disk",
        );
      }

      const input = toParserInput(file, path);
      const parser = registry.resolve(input);

      if (!force) {
        const cached = getParsedDocument(fileId);
        if (
          cached &&
          cached.parserId === parser.id &&
          cached.parserVersion === parser.version
        ) {
          return cached;
        }
      }

      file = touchStatus(file, "parsing", {
        errorCode: undefined,
        errorMessage: undefined,
      });

      let doc: ParsedDocument;
      try {
        doc = await parser.parse(input, signal);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Parse failed";
        touchStatus(file, "failed", {
          errorCode: "FILE_PARSE_FAILED",
          errorMessage: message,
        });
        throw FilePlatformError.fromCode(
          "FILE_PARSE_FAILED",
          message,
          { retryable: true },
        );
      }

      upsertParsedDocument(doc);
      file = touchStatus(file, "parsed", {
        parserId: doc.parserId,
        parseVersion: doc.parserVersion,
        errorCode: undefined,
        errorMessage: undefined,
      });

      if (config.indexing.enabled) {
        try {
          file = touchStatus(file, "indexing");
          indexParsedDocument(
            pid,
            doc,
            config.indexing.chunkChars,
            config.indexing.overlapChars,
          );
        } catch {
          // Indexing failure must not discard a successful parse.
        }
      }

      touchStatus(file, "ready", {
        parserId: doc.parserId,
        parseVersion: doc.parserVersion,
        errorCode: undefined,
        errorMessage: undefined,
      });

      return doc;
    } finally {
      sem?.release();
    }
  })();

  inflight.set(inflightKey, job);
  try {
    return await job;
  } finally {
    inflight.delete(inflightKey);
  }
}

/** Fire-and-forget parse after import — delegated to FileJobQueue. */
export { scheduleParseJob as scheduleParseAfterImport } from "./jobs/parse-file-job";

/** Clear semaphore/inflight state between tests. */
export function resetParseServiceState(): void {
  inflight.clear();
  semaphore = null;
}
