/**
 * Shared contracts for File Platform security policy and config DTOs.
 * FileError lives in [[file-errors.ts]]; import errors from the package barrel.
 */

import type { ManagedFileCategory } from "./managed-file";

export interface FileSecurityPolicy {
  maxImportBytes: number;
  maxParseBytes: number;
  allowedExtensions: string[];
  deniedExtensions: string[];
  allowArchives: boolean;
  allowExternalOpen: boolean;
}

export const DEFAULT_DENIED_EXTENSIONS: readonly string[] = [
  "exe",
  "dll",
  "com",
  "bat",
  "cmd",
  "ps1",
  "sh",
  "app",
  "dmg",
  "pkg",
  "msi",
  "scr",
  "jar",
];

export interface DesktopFilesParsingConfig {
  enabled: boolean;
  concurrency: number;
  officeParser: string;
  pdfParser: string;
  ocrEnabled: boolean;
  /** Absolute path or command name for the MarkItDown CLI (optional). */
  markitdownBin: string;
  /** Conversion timeout in milliseconds. */
  markitdownTimeoutMs: number;
}

export interface DesktopFilesIndexingConfig {
  enabled: boolean;
  provider: "fts5";
  chunkChars: number;
  overlapChars: number;
  maxResults: number;
}

export interface DesktopFilesPreviewConfig {
  markdown: boolean;
  mermaid: boolean;
  svg: boolean;
  artifact: boolean;
  pdf: boolean;
  externalNetwork: boolean;
}

export interface DesktopFilesCleanupConfig {
  orphanRetentionDays: number;
  tempRetentionHours: number;
}

/** Full Main-process config for `desktop.files.*`. */
export interface DesktopFilesConfig {
  managedStorage: boolean;
  copyPickerFiles: boolean;
  maxImportMb: number;
  maxParseMb: number;
  maxInlineTextChars: number;
  parsing: DesktopFilesParsingConfig;
  indexing: DesktopFilesIndexingConfig;
  preview: DesktopFilesPreviewConfig;
  cleanup: DesktopFilesCleanupConfig;
}

export const DEFAULT_DESKTOP_FILES_CONFIG: DesktopFilesConfig = {
  managedStorage: true,
  copyPickerFiles: false,
  maxImportMb: 100,
  maxParseMb: 50,
  maxInlineTextChars: 40_000,
  parsing: {
    enabled: true,
    concurrency: 2,
    officeParser: "markitdown",
    pdfParser: "markitdown",
    ocrEnabled: false,
    markitdownBin: "",
    markitdownTimeoutMs: 60_000,
  },
  indexing: {
    enabled: true,
    provider: "fts5",
    chunkChars: 4000,
    overlapChars: 400,
    maxResults: 6,
  },
  preview: {
    markdown: true,
    mermaid: true,
    svg: true,
    artifact: true,
    pdf: true,
    externalNetwork: false,
  },
  cleanup: {
    orphanRetentionDays: 30,
    tempRetentionHours: 24,
  },
};

/**
 * Trimmed capability flags safe to send to the Renderer.
 * Absolute paths and full policy lists stay in Main.
 */
export interface FilesHandlerCapabilities {
  listSession: boolean;
  getPreview: boolean;
  createFromMessage: boolean;
  saveAs: boolean;
  open: boolean;
  reveal: boolean;
}

export interface FilesCapabilities {
  managedStorage: boolean;
  copyPickerFiles: boolean;
  maxImportMb: number;
  maxParseMb: number;
  maxInlineTextChars: number;
  parsingEnabled: boolean;
  indexingEnabled: boolean;
  /** True when MarkItDown CLI probe succeeded recently (best-effort). */
  markitdownAvailable: boolean;
  preview: DesktopFilesPreviewConfig;
  categories: ManagedFileCategory[];
  /** P0 IPC handlers registered and invokable. */
  handlers: FilesHandlerCapabilities;
  /** True when all P0 handlers are available. */
  available: boolean;
}
