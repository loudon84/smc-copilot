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

/** Renderer-safe view of a managed file (no absolute paths in remote mode). */
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
  /** Present only in local mode or for managed copies. */
  displayPath?: string;
  hasManagedCopy: boolean;
  associationRole?: FileAssociationRole;
  ordinal?: number;
}
