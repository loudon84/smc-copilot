/**
 * IPC DTO contracts for `window.hermesAPI.files`.
 * Channel names use the `files:` prefix in Main/Preload.
 */

import type { FileError } from "./file-errors";
import type { FilesCapabilities } from "./file-contracts";
import type { FilePreviewDescriptor, FilePreviewOptions } from "./file-preview";
import type { FileJobResult } from "./parser-contract";
import type { FileJobEventListener } from "./file-job";
import type { FileDomainEventListener } from "./file-events";
import type { FileAssociation, FileAssociationRole } from "./file-association";
import type {
  FileTransportMode,
  ManagedFileView,
  ParsedDocument,
} from "./managed-file";
import type {
  CreateFileFromMessageInput,
  CreateFileFromMessageResult,
} from "./message-document";

export interface FilePickerOptions {
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface FileImportContext {
  profile?: string;
  sessionId: string;
  mode: FileTransportMode;
  source: "picker" | "drag-drop" | "clipboard";
}

export interface ClipboardFileInput {
  filename: string;
  mime: string;
  /** Base64-encoded file bytes. */
  base64Bytes: string;
}

export type FileImportResult =
  | { ok: true; file: ManagedFileView }
  | { ok: false; error: FileError };

export interface AttachFileToMessageInput {
  profile?: string;
  sessionId: string;
  messageId: string;
  fileId: string;
  role?: FileAssociationRole;
  ordinal?: number;
}

export interface DetachFileFromMessageInput {
  profile?: string;
  associationId: string;
}

export interface AddFileToContextInput {
  profile?: string;
  sessionId: string;
  fileId: string;
}

export interface RemoveFileFromContextInput {
  profile?: string;
  sessionId: string;
  fileId: string;
}

export interface SearchSessionFilesInput {
  profile?: string;
  sessionId: string;
  query: string;
  maxResults?: number;
}

export interface FileSearchResult {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  snippet: string;
  score: number;
}

export interface DeleteFileAssociationInput {
  profile?: string;
  associationId: string;
}

export interface ResolveAttachmentsInput {
  profile?: string;
  fileIds: string[];
  mode: FileTransportMode;
}

export interface HermesFilesAPI {
  getCapabilities(profile?: string): Promise<FilesCapabilities>;

  pickFiles(
    options: FilePickerOptions | undefined,
    context: FileImportContext,
  ): Promise<FileImportResult[]>;

  importDroppedFiles(
    paths: string[],
    context: FileImportContext,
  ): Promise<FileImportResult[]>;

  stageClipboardFile(
    input: ClipboardFileInput,
    context: FileImportContext,
  ): Promise<FileImportResult>;

  listSessionFiles(
    profile: string | undefined,
    sessionId: string,
  ): Promise<ManagedFileView[]>;

  getFile(
    profile: string | undefined,
    fileId: string,
  ): Promise<ManagedFileView | null>;

  getPreview(
    profile: string | undefined,
    fileId: string,
    options?: FilePreviewOptions,
  ): Promise<FilePreviewDescriptor | { error: FileError }>;

  getParsedContent(
    profile: string | undefined,
    fileId: string,
  ): Promise<ParsedDocument | null>;

  retryParse(
    profile: string | undefined,
    fileId: string,
  ): Promise<FileJobResult>;

  /**
   * Resolve managed file ids to legacy Attachments for the send path.
   * Attachment.id matches ManagedFile.id so send-message can dual-write associations.
   */
  toAttachments(
    input: ResolveAttachmentsInput,
  ): Promise<import("../attachments").Attachment[]>;

  attachToMessage(input: AttachFileToMessageInput): Promise<FileAssociation>;

  detachFromMessage(input: DetachFileFromMessageInput): Promise<void>;

  addToSessionContext(input: AddFileToContextInput): Promise<void>;

  removeFromSessionContext(input: RemoveFileFromContextInput): Promise<void>;

  searchSessionFiles(
    input: SearchSessionFilesInput,
  ): Promise<FileSearchResult[]>;

  openExternal(profile: string | undefined, fileId: string): Promise<void>;

  revealInFolder(profile: string | undefined, fileId: string): Promise<void>;

  saveAs(
    profile: string | undefined,
    fileId: string,
  ): Promise<string | null>;

  /**
   * Persist an Assistant Message body as a ManagedFile with role agent-output.
   * Idempotent per (sessionId, messageId, role) — returns alreadyExisted when
   * the association already exists.
   */
  createFromMessage(
    input: CreateFileFromMessageInput,
  ): Promise<CreateFileFromMessageResult>;

  deleteAssociation(input: DeleteFileAssociationInput): Promise<void>;

  /** Best-effort orphan/temp cleanup for the profile's managed files. */
  cleanup(profile?: string): Promise<{ orphansRemoved: number; tempsRemoved: number }>;

  /**
   * Subscribe to parse/index job progress. Returns unsubscribe.
   * Events never include absolute filesystem paths.
   */
  onFileJobEvent(callback: FileJobEventListener): () => void;

  /**
   * Subscribe to ManagedFile / association domain events. Returns unsubscribe.
   * Events never include absolute filesystem paths.
   */
  onFileDomainEvent(callback: FileDomainEventListener): () => void;
}

/** IPC channel names — keep in sync with Main handlers and Preload. */
export const FILES_IPC_CHANNELS = {
  getCapabilities: "files:get-capabilities",
  pickFiles: "files:pick-files",
  importDroppedFiles: "files:import-dropped",
  stageClipboardFile: "files:stage-clipboard",
  listSessionFiles: "files:list-session",
  getFile: "files:get",
  getPreview: "files:get-preview",
  getParsedContent: "files:get-parsed",
  retryParse: "files:retry-parse",
  toAttachments: "files:to-attachments",
  attachToMessage: "files:attach-to-message",
  detachFromMessage: "files:detach-from-message",
  addToSessionContext: "files:add-to-context",
  removeFromSessionContext: "files:remove-from-context",
  searchSessionFiles: "files:search-session",
  openExternal: "files:open-external",
  revealInFolder: "files:reveal-in-folder",
  saveAs: "files:save-as",
  createFromMessage: "files:create-from-message",
  deleteAssociation: "files:delete-association",
  cleanup: "files:cleanup",
} as const;

export type FilesIpcChannel =
  (typeof FILES_IPC_CHANNELS)[keyof typeof FILES_IPC_CHANNELS];
