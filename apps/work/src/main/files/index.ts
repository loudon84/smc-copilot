/**
 * Public Main-process File Platform surface.
 */

export {
  readDesktopFilesConfig,
  toFilesCapabilities,
} from "./file-config";

export {
  DEFAULT_DENIED_EXTENSIONS,
  FilePlatformError,
  canonicalizePath,
  assertPathAllowed,
  isDeniedExtension,
  extensionFromName,
  detectMagicKind,
  detectStrictContentKind,
  assertImportAllowed,
} from "./file-security";

export {
  validateFileContent,
  FILE_CONTENT_UNREADABLE_MESSAGE,
  MAX_PREFIX_BYTES,
  logContentCheckEvent,
  type FileContentValidationResult,
} from "./protected-file-detector";

export {
  assertUploadBytesReadable,
  logUploadByteCheckEvent,
  FILE_UPLOAD_CONTENT_UNREADABLE_MESSAGE,
  type UploadByteGateResult,
} from "./upload-byte-gate";

export {
  ensureFilesLayout,
  hashFileStream,
  storeManagedCopy,
  stageClipboardBytes,
  stageAttachment,
  clearStagedAttachments,
  allocateTempPath,
} from "./file-store";

export {
  openFileIndexDb,
  closeFileIndexDb,
  normalizeProfileId,
  upsertManagedFile,
  getManagedFile,
  findByHash,
  findByRemoteIdentity,
  listBySession,
  listByMessage,
  insertAssociation,
  deleteAssociation,
  countAssociations,
  findAssociation,
  listChunksForFile,
  listOrphanManagedFiles,
  deleteManagedFileRecord,
  upsertParsedDocument,
  getParsedDocument,
  insertChunks,
  searchChunks,
} from "./file-association-store";

export { toManagedFile, toHermesAttachment } from "./attachment-adapter";

export { getPreviewDescriptor, PREVIEW_TEXT_LIMIT, registerFilePreviewSchemePrivileged, registerFilePreviewProtocolHandler, FILE_PREVIEW_SCHEME } from "./file-preview-service";

export {
  openExternal as openFileExternal,
  revealInFolder as revealFileInFolder,
  saveAs as saveFileAs,
} from "./file-operation-service";

export {
  FileParserRegistry,
  getDefaultParserRegistry,
  resetDefaultParserRegistry,
} from "./file-parser-registry";

export {
  parseFile,
  scheduleParseAfterImport,
  chunkText,
  deleteChunksForFile,
  resetParseServiceState,
} from "./file-parse-service";

export {
  listSessionIndexedFiles,
  searchSessionChunks,
} from "./file-index-service";

export {
  buildSessionFileContext,
  type BuildSessionFileContextInput,
  type SessionFileContextResult,
} from "./file-context-builder";

export { composeWireMessageWithSessionContext } from "./compose-wire-session-context";

export {
  cleanupOrphanFiles,
  cleanupTempFiles,
  runFilesCleanupBestEffort,
} from "./file-cleanup-service";

export {
  fileService,
  registerAgentOutputFile,
} from "./file-service";

export { createFromMessage } from "./agent-output/agent-output-service";
export {
  sanitizeGeneratedFileName,
  createGeneratedFileName,
  resolveUniqueFileName,
  sanitizeSessionDirSegment,
} from "./agent-output/generated-file-name";

export { materializeRemoteExpertArtifact } from "./materialize-remote-expert-artifact";
export {
  invalidatePreviewCache,
  resolvePreviewCachePath,
} from "./preview-cache";

export {
  emitFileDomainEvent,
  subscribeFileDomainEvents,
} from "./file-domain-events";

export { registerFilesIpcHandlers } from "./register-file-ipc";

export {
  FileJobQueue,
  getFileJobQueue,
  resetFileJobQueue,
  enqueueParseFileJob,
  scheduleParseJob,
  emitFileJobEvent,
  subscribeFileJobEvents,
} from "./jobs";

export {
  defaultFilePathPolicy,
  DefaultFilePathPolicy,
  type FilePathPolicy,
} from "./file-path-policy";

export {
  classifyFileCategory,
  guessMime,
  resolveFileCategory,
  resolveMime,
} from "./file-category";

export { importOnePath, stageClipboardImport } from "./file-import-service";

export {
  LocalMarkItDownProvider,
  createLocalMarkItDownProvider,
  probeMarkItDownAvailable,
  resetMarkItDownAvailabilityCache,
  type DocumentConversionProvider,
  type LocalMarkItDownOptions,
} from "./conversion";

export {
  toManagedFileView,
  hashOrError,
  readFileSize,
  nowIso,
} from "./file-metadata";
