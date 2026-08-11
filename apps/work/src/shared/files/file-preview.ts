/**
 * Preview descriptor contracts for the File Preview Panel.
 */

import type { MessageDocumentPreviewInput } from "./message-document";

export type PreviewType =
  | "image"
  | "text"
  | "markdown"
  | "code"
  | "pdf"
  | "html"
  | "office"
  | "unsupported";

/**
 * Where preview content comes from: a stored ManagedFile, or an in-memory
 * Assistant Message document (no physical file yet).
 */
export type FilePreviewSource =
  | {
      type: "managed-file";
      fileId: string;
    }
  | {
      type: "message-document";
      sessionId: string;
      messageId: string;
      title: string;
      content: string;
    };

export interface FilePreviewDescriptor {
  fileId: string;
  type: PreviewType;
  title: string;
  content?: string;
  localUrl?: string;
  language?: string;
  mime: string;
  encoding?: string;
  truncated?: boolean;
  /** Byte offset where `content` starts (paginated text). */
  offset?: number;
  /** Next byte offset to request, when more text remains. */
  nextOffset?: number;
  /** Total file size in bytes when known. */
  totalBytes?: number;
  canOpenExternal: boolean;
  canSaveAs: boolean;
  canCopyText: boolean;
  canAddToContext: boolean;
  canRetryParse: boolean;
  unsupportedReason?: string;
}

export type { MessageDocumentPreviewInput };

export interface FilePreviewOptions {
  /** Byte offset for text/code/markdown/html ranged reads. */
  offset?: number;
  /** Max bytes to return (defaults to PREVIEW_TEXT_LIMIT). */
  limit?: number;
}
