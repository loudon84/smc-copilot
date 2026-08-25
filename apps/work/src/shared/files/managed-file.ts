/**
 * Core ManagedFile domain types shared by Main, Preload, and Renderer.
 * Do not import Electron, React, or Node APIs from this module.
 */

import type { FileAssociationRole } from "./file-association";

export type ManagedFileStatus =
  | "selected"
  | "staging"
  | "stored"
  | "parsing"
  | "parsed"
  | "indexing"
  | "ready"
  | "failed"
  | "missing"
  | "deleted";

/** Alias matching PRD v1.1 stage naming; same union as ManagedFileStatus. */
export type ManagedFileStage = ManagedFileStatus;

export type ManagedFileSource =
  | "picker"
  | "drag-drop"
  | "clipboard"
  | "agent-output"
  | "workspace"
  | "session-restore";

export type ManagedFileCategory =
  | "image"
  | "text"
  | "markdown"
  | "code"
  | "pdf"
  | "office"
  | "spreadsheet"
  | "presentation"
  | "epub"
  | "archive"
  | "html"
  | "unknown";

export type FileTransportMode = "local" | "remote";

/** Resource locality on the ManagedFile record (not Hermes attachment transport). */
export type ManagedFileLocality = "local" | "remote";

export type ManagedFileRemoteProvider = "expert";

export type ManagedFileAvailability =
  | "available"
  | "forbidden"
  | "not-found"
  | "unavailable";

export interface ManagedFile {
  id: string;
  profileId: string;
  name: string;
  extension: string;
  mime: string;
  category: ManagedFileCategory;
  source: ManagedFileSource;
  status: ManagedFileStatus;
  size: number;
  originalPath?: string;
  managedPath?: string;
  contentHash?: string;
  parserId?: string;
  parseVersion?: number;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  errorMessage?: string;
  /** Defaults to local when absent (legacy rows). */
  locality?: ManagedFileLocality;
  /** Remote provider identity; required when locality is remote. */
  provider?: ManagedFileRemoteProvider;
  remoteArtifactId?: string;
  remoteTaskId?: string;
  availability?: ManagedFileAvailability;
  /** Provider preview_supported (default false when absent). */
  providerPreviewSupported?: boolean;
  /** Main-normalized UI capability; Renderer must not invent this. */
  canPreview?: boolean;
}

export interface ParsedSection {
  id: string;
  title?: string;
  text: string;
  startOffset?: number;
  endOffset?: number;
  page?: number;
  sheet?: string;
  slide?: number;
}

export interface ParsedDocument {
  fileId: string;
  parserId: string;
  parserVersion: number;
  title?: string;
  text: string;
  language?: string;
  pageCount?: number;
  sheetCount?: number;
  slideCount?: number;
  sections: ParsedSection[];
  metadata: Record<string, string | number | boolean>;
  truncated: boolean;
  parsedAt: string;
}

/** Renderer-safe view of a managed file (no absolute paths / URLs / JWT). */
export interface ManagedFileView {
  id: string;
  name: string;
  extension: string;
  mime: string;
  category: ManagedFileCategory;
  source: ManagedFileSource;
  status: ManagedFileStatus;
  size: number;
  contentHash?: string;
  parserId?: string;
  parseVersion?: number;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  errorMessage?: string;
  /** Present only for local resources (never absolute cache path for remote). */
  displayPath?: string;
  hasManagedCopy: boolean;
  associationRole?: FileAssociationRole;
  ordinal?: number;
  locality?: ManagedFileLocality;
  provider?: ManagedFileRemoteProvider;
  remoteArtifactId?: string;
  remoteTaskId?: string;
  availability?: ManagedFileAvailability;
  providerPreviewSupported?: boolean;
  canPreview?: boolean;
  canOpen?: boolean;
  canReveal?: boolean;
  /** Originating message id when associated (e.g. expert assistant bubble). */
  messageId?: string;
  taskId?: string;
}
