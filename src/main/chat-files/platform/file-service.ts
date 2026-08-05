/**
 * FileService facade implementing HermesFilesAPI (import, associations, context, search).
 */

import { randomUUID } from "crypto";
import { sep } from "path";
import { existsSync } from "fs";
import { BrowserWindow, dialog } from "electron";
import {
  makeFileError,
  type AddFileToContextInput,
  type AttachFileToMessageInput,
  type ClipboardFileInput,
  type CreateFileFromMessageInput,
  type CreateFileFromMessageResult,
  type DetachFileFromMessageInput,
  type FileAssociation,
  type FileAssociationRole,
  type FileImportContext,
  type FileImportResult,
  type FilePickerOptions,
  type FileSearchResult,
  type FilesCapabilities,
  type HermesFilesAPI,
  type ManagedFile,
  type ManagedFileView,
  type RemoveFileFromContextInput,
  type ResolveAttachmentsInput,
  type SearchSessionFilesInput,
} from "../../../shared/files";
import { readDesktopFilesConfig, toFilesCapabilities } from "./file-config";
import {
  canonicalizePath,
  FilePlatformError,
} from "./file-security";
import {
  findAssociation,
  getManagedFile,
  getParsedDocument,
  insertAssociation,
  listBySession,
  normalizeProfileId,
  upsertManagedFile,
  deleteAssociation as storeDeleteAssociation,
} from "./file-association-store";
import { toHermesAttachment } from "./attachment-adapter";
import type { Attachment } from "../../../shared/attachments";
import { parseFile } from "./file-parse-service";
import { enqueueParseFileJob } from "./jobs/parse-file-job";
import { getPreviewDescriptor } from "./file-preview-service";
import {
  openExternal as openFileExternal,
  revealInFolder as revealFileInFolder,
  saveAs as saveFileAs,
} from "./file-operation-service";
import { searchSessionChunks } from "./file-index-service";
import {
  cleanupOrphanFiles,
  cleanupTempFiles,
} from "./file-cleanup-service";
import { getSessionContextFolder } from "./session-context-folder-store";
import { profileHome } from "../../utils";
import { importOnePath, stageClipboardImport } from "./file-import-service";
import { nowIso, toManagedFileView } from "./file-metadata";
import { createFromMessage as createAgentOutputFromMessage } from "./agent-output/agent-output-service";

function profileOrDefault(profile?: string): string {
  return normalizeProfileId(profile);
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : root + sep;
  return candidate === root || candidate.startsWith(normalizedRoot);
}

/** Resolve a fileId to its on-disk path, or throw a `FilePlatformError`. */
function resolveManagedFilePath(
  profile: string | undefined,
  fileId: string,
): { file: ManagedFile; path: string } {
  const file = getManagedFile(profileOrDefault(profile), fileId);
  if (!file) {
    throw FilePlatformError.fromCode("FILE_NOT_FOUND", "Managed file not found");
  }
  const path = file.managedPath || file.originalPath;
  if (!path || !existsSync(path)) {
    throw FilePlatformError.fromCode("FILE_NOT_FOUND", "File is missing from disk", {
      detail: "missing-on-disk",
    });
  }
  return { file, path };
}

// @lat: [[file-platform#FileService]]
export const fileService: HermesFilesAPI = {
  async getCapabilities(profile?: string): Promise<FilesCapabilities> {
    const config = readDesktopFilesConfig(profile);
    let markitdownAvailable = false;
    if (
      config.parsing.pdfParser === "markitdown" ||
      config.parsing.officeParser === "markitdown"
    ) {
      const { probeMarkItDownAvailable } = await import("./conversion");
      markitdownAvailable = await probeMarkItDownAvailable({
        bin: config.parsing.markitdownBin || undefined,
        timeoutMs: Math.min(config.parsing.markitdownTimeoutMs, 5000),
      });
    }
    return toFilesCapabilities(config, { markitdownAvailable });
  },

  async pickFiles(
    options: FilePickerOptions | undefined,
    context: FileImportContext,
  ): Promise<FileImportResult[]> {
    const win = BrowserWindow.getFocusedWindow();
    const properties: Array<"openFile" | "multiSelections"> = ["openFile"];
    if (options?.multiple !== false) properties.push("multiSelections");
    const dialogOpts = {
      properties,
      filters: options?.filters?.map((f) => ({
        name: f.name,
        extensions: f.extensions,
      })),
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    if (result.canceled || !result.filePaths?.length) return [];
    const pickerContext: FileImportContext = {
      ...context,
      source: "picker",
    };
    const out: FileImportResult[] = [];
    for (const p of result.filePaths) {
      out.push(await importOnePath(p, pickerContext));
    }
    return out;
  },

  async importDroppedFiles(
    paths: string[],
    context: FileImportContext,
  ): Promise<FileImportResult[]> {
    const dropContext: FileImportContext = {
      ...context,
      source: "drag-drop",
    };
    const out: FileImportResult[] = [];
    for (const p of paths || []) {
      if (typeof p !== "string" || !p.trim()) {
        out.push({
          ok: false,
          error: makeFileError("FILE_NOT_FOUND", "Empty file path"),
        });
        continue;
      }
      out.push(await importOnePath(p, dropContext));
    }
    return out;
  },

  async stageClipboardFile(
    input: ClipboardFileInput,
    context: FileImportContext,
  ): Promise<FileImportResult> {
    return stageClipboardImport(input, context);
  },

  async listSessionFiles(
    profile: string | undefined,
    sessionId: string,
  ): Promise<ManagedFileView[]> {
    const rows = listBySession(profileOrDefault(profile), sessionId);
    return rows.map((row) =>
      toManagedFileView(row, {
        associationRole: row.association.role,
        ordinal: row.association.ordinal,
      }),
    );
  },

  async getFile(
    profile: string | undefined,
    fileId: string,
  ): Promise<ManagedFileView | null> {
    const file = getManagedFile(profileOrDefault(profile), fileId);
    return file ? toManagedFileView(file) : null;
  },

  async getPreview(
    profile: string | undefined,
    fileId: string,
    options?: import("../../../shared/files").FilePreviewOptions,
  ) {
    return getPreviewDescriptor(profile, fileId, options);
  },

  async getParsedContent(
    profile: string | undefined,
    fileId: string,
  ) {
    const cached = getParsedDocument(fileId);
    if (cached) return cached;
    try {
      return await parseFile(profile, fileId);
    } catch {
      return getParsedDocument(fileId);
    }
  },

  async retryParse(profile: string | undefined, fileId: string) {
    const id = fileId || "";
    try {
      await enqueueParseFileJob({
        profile,
        fileId: id,
        force: true,
        wait: true,
      });
      return { fileId: id, ok: true };
    } catch (err) {
      const fe =
        err instanceof FilePlatformError
          ? err.fileError
          : makeFileError(
              "FILE_PARSE_FAILED",
              err instanceof Error ? err.message : "Parse failed",
              { retryable: true },
            );
      return {
        fileId: id,
        ok: false,
        errorCode: fe.code,
        errorMessage: fe.message,
      };
    }
  },

  async toAttachments(input: ResolveAttachmentsInput): Promise<Attachment[]> {
    const profileId = profileOrDefault(input.profile);
    const config = readDesktopFilesConfig(input.profile);
    const mode = input.mode === "remote" ? "remote" : "local";
    const out: Attachment[] = [];
    for (const fileId of input.fileIds || []) {
      const file = getManagedFile(profileId, fileId);
      if (!file) continue;
      const parsed = getParsedDocument(fileId) ?? undefined;
      try {
        out.push(
          await toHermesAttachment(file, {
            parsed,
            mode,
            maxInlineTextChars: config.maxInlineTextChars,
          }),
        );
      } catch {
        // Skip files that cannot be resolved for the current transport mode.
      }
    }
    return out;
  },

  async attachToMessage(
    input: AttachFileToMessageInput,
  ): Promise<FileAssociation> {
    const profileId = profileOrDefault(input.profile);
    const file = getManagedFile(profileId, input.fileId);
    if (!file) {
      throw FilePlatformError.fromCode("FILE_NOT_FOUND", "Managed file not found");
    }
    const role: FileAssociationRole =
      input.role === "prompt-attachment" || input.role === "message-attachment"
        ? input.role
        : "message-attachment";
    const assoc: FileAssociation = {
      id: randomUUID(),
      fileId: input.fileId,
      profileId,
      sessionId: input.sessionId,
      messageId: input.messageId,
      role,
      ordinal: input.ordinal ?? 0,
      createdAt: nowIso(),
    };
    insertAssociation(assoc);
    return assoc;
  },

  async detachFromMessage(input: DetachFileFromMessageInput): Promise<void> {
    storeDeleteAssociation(
      profileOrDefault(input.profile),
      input.associationId,
    );
  },

  async addToSessionContext(input: AddFileToContextInput): Promise<void> {
    const profileId = profileOrDefault(input.profile);
    const file = getManagedFile(profileId, input.fileId);
    if (!file) {
      throw FilePlatformError.fromCode("FILE_NOT_FOUND", "Managed file not found");
    }
    const existing = findAssociation({
      profileId,
      fileId: input.fileId,
      sessionId: input.sessionId,
      role: "context-file",
    });
    if (existing) return;

    insertAssociation({
      id: randomUUID(),
      fileId: input.fileId,
      profileId,
      sessionId: input.sessionId,
      role: "context-file",
      ordinal: 0,
      createdAt: nowIso(),
    });
  },

  async removeFromSessionContext(
    input: RemoveFileFromContextInput,
  ): Promise<void> {
    const profileId = profileOrDefault(input.profile);
    const rows = listBySession(profileId, input.sessionId).filter(
      (row) =>
        row.id === input.fileId && row.association.role === "context-file",
    );
    for (const row of rows) {
      storeDeleteAssociation(profileId, row.association.id);
    }
  },

  async searchSessionFiles(
    input: SearchSessionFilesInput,
  ): Promise<FileSearchResult[]> {
    const profileId = profileOrDefault(input.profile);
    const config = readDesktopFilesConfig(input.profile);
    const maxResults = Math.max(
      1,
      input.maxResults ?? config.indexing.maxResults,
    );
    const hits = searchSessionChunks({
      profileId,
      sessionId: input.sessionId,
      query: input.query,
      maxResults,
    });
    const nameById = new Map(
      listBySession(profileId, input.sessionId).map((row) => [
        row.id,
        row.name,
      ]),
    );
    return hits.map((hit) => ({
      fileId: hit.fileId,
      fileName: nameById.get(hit.fileId) || hit.fileId,
      chunkIndex: hit.chunkIndex,
      snippet: hit.content.slice(0, 280),
      score: hit.score,
    }));
  },

  async openExternal(profile: string | undefined, fileId: string): Promise<void> {
    const { path } = resolveManagedFilePath(profile, fileId);
    await openFileExternal(path);
  },

  async revealInFolder(profile: string | undefined, fileId: string): Promise<void> {
    const { path } = resolveManagedFilePath(profile, fileId);
    revealFileInFolder(path);
  },

  async saveAs(profile: string | undefined, fileId: string): Promise<string | null> {
    const { file, path } = resolveManagedFilePath(profile, fileId);
    return saveFileAs(path, file.name);
  },

  async createFromMessage(
    input: CreateFileFromMessageInput,
  ): Promise<CreateFileFromMessageResult> {
    return createAgentOutputFromMessage(input);
  },

  async deleteAssociation(input): Promise<void> {
    storeDeleteAssociation(
      profileOrDefault(input.profile),
      input.associationId,
    );
  },

  async cleanup(profile?: string) {
    const orphans = cleanupOrphanFiles(profile);
    const temps = cleanupTempFiles(profile);
    return {
      orphansRemoved: orphans.deletedFiles,
      tempsRemoved: temps.deletedFiles,
    };
  },

  /** Push subscription lives in preload — Main never attaches ipcRenderer. */
  onFileJobEvent() {
    return () => undefined;
  },

  onFileDomainEvent() {
    return () => undefined;
  },
};

/**
 * Register an agent-produced path as a managed file when it sits under the
 * profile home or the session context folder. Arbitrary paths are rejected.
 */
export async function registerAgentOutputFile(
  profile: string | undefined,
  sessionId: string,
  filePath: string,
): Promise<ManagedFileView | null> {
  const profileId = profileOrDefault(profile);
  let canonical: string;
  try {
    canonical = canonicalizePath(filePath);
  } catch {
    return null;
  }
  if (!existsSync(canonical)) return null;

  const home = profileHome(profile);
  const contextFolder = getSessionContextFolder(sessionId);
  const allowed =
    isPathInsideRoot(home, canonical) ||
    (contextFolder
      ? isPathInsideRoot(canonicalizePath(contextFolder), canonical)
      : false);
  if (!allowed) return null;

  const result = await importOnePath(canonical, {
    profile: profileId === "default" ? undefined : profileId,
    sessionId,
    mode: "local",
    source: "drag-drop",
  });
  if (!result.ok) return null;

  const rows = listBySession(profileId, sessionId).filter(
    (row) => row.id === result.file.id,
  );
  for (const row of rows) {
    if (row.association.role === "prompt-attachment") {
      storeDeleteAssociation(profileId, row.association.id);
    }
  }
  const managed = getManagedFile(profileId, result.file.id);
  if (managed) {
    upsertManagedFile({
      ...managed,
      source: "agent-output",
      updatedAt: nowIso(),
    });
  }
  insertAssociation({
    id: randomUUID(),
    fileId: result.file.id,
    profileId,
    sessionId,
    role: "agent-output",
    ordinal: 0,
    createdAt: nowIso(),
  });
  const file = getManagedFile(profileId, result.file.id);
  return file
    ? toManagedFileView(file, { associationRole: "agent-output", ordinal: 0 })
    : result.file;
}
