/**
 * Framework-owned preview source model (PRD §6.1).
 * Do not merge with `src/shared/files/file-preview.ts` managed-file | message-document union.
 */

export type FilePreviewSourceType = "local" | "url" | "knowledge";

export interface FilePreviewSource {
  id: string;
  name: string;
  type: FilePreviewSourceType;
  path?: string;
  url?: string;
  mime?: string;
  /** Knowledge cache key companion; optional beyond PRD core fields. */
  activeVersionId?: string | null;
}

/** Stable identity for load effects — value-compare, not object reference. */
export function filePreviewSourceIdentity(source: FilePreviewSource): string {
  return [
    source.type,
    source.id,
    source.name,
    source.path ?? "",
    source.url ?? "",
    source.mime ?? "",
    source.activeVersionId ?? "",
  ].join("\0");
}

export type FilePreviewEngineCapability =
  | "must"
  | "should"
  | "unsupported";

export type FilePreviewFormat =
  | "markdown"
  | "txt"
  | "html"
  | "pdf"
  | "image"
  | "json"
  | "code"
  | "docx"
  | "unsupported";

export interface ResolvedPreviewFile {
  file: File;
  fileName: string;
  mime?: string;
  format: FilePreviewFormat;
}

export type FileProviderResolveOptions = {
  forceRefresh?: boolean;
  /** Progress while resolving bytes (download / prepare for viewer). */
  onPhase?: (phase: FilePreviewLoadPhase) => void;
};

export type FilePreviewLoadPhase = "download" | "prepare";

export type FileProviderResult =
  | { ok: true; resolved: ResolvedPreviewFile }
  | { ok: false; reason: "unavailable" | "error"; message?: string };

export interface FilePreviewProvider {
  resolve(
    source: FilePreviewSource,
    options?: FileProviderResolveOptions,
  ): Promise<FileProviderResult>;
}
