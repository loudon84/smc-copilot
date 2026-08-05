/**
 * Main-process reader for `desktop.files.*` profile config.
 * Renderer only receives trimmed [[FilesCapabilities]].
 */

import { getConfigValue } from "../../config";
import {
  DEFAULT_DESKTOP_FILES_CONFIG,
  type DesktopFilesCleanupConfig,
  type DesktopFilesConfig,
  type DesktopFilesIndexingConfig,
  type DesktopFilesParsingConfig,
  type DesktopFilesPreviewConfig,
  type FilesCapabilities,
  type ManagedFileCategory,
} from "../../../shared/files";

const ALL_CATEGORIES: ManagedFileCategory[] = [
  "image",
  "text",
  "markdown",
  "code",
  "pdf",
  "office",
  "spreadsheet",
  "presentation",
  "epub",
  "archive",
  "html",
  "unknown",
];

function readRaw(key: string, profile?: string): string | null {
  try {
    return getConfigValue(key, profile);
  } catch {
    return null;
  }
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") return fallback;
  const lower = raw.trim().toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes" || lower === "on") {
    return true;
  }
  if (lower === "false" || lower === "0" || lower === "no" || lower === "off") {
    return false;
  }
  return fallback;
}

function parseNumber(raw: string | null, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseString(raw: string | null, fallback: string): string {
  if (raw == null || raw.trim() === "") return fallback;
  return raw.trim();
}

function readParsing(
  profile: string | undefined,
  defaults: DesktopFilesParsingConfig,
): DesktopFilesParsingConfig {
  return {
    enabled: parseBool(
      readRaw("desktop.files.parsing.enabled", profile),
      defaults.enabled,
    ),
    concurrency: parseNumber(
      readRaw("desktop.files.parsing.concurrency", profile),
      defaults.concurrency,
    ),
    officeParser: parseString(
      readRaw("desktop.files.parsing.office_parser", profile),
      defaults.officeParser,
    ),
    pdfParser: parseString(
      readRaw("desktop.files.parsing.pdf_parser", profile),
      defaults.pdfParser,
    ),
    ocrEnabled: parseBool(
      readRaw("desktop.files.parsing.ocr_enabled", profile),
      defaults.ocrEnabled,
    ),
    markitdownBin: parseString(
      readRaw("desktop.files.parsing.markitdown_bin", profile),
      defaults.markitdownBin,
    ),
    markitdownTimeoutMs: parseNumber(
      readRaw("desktop.files.parsing.markitdown_timeout_ms", profile),
      defaults.markitdownTimeoutMs,
    ),
  };
}

function readIndexing(
  profile: string | undefined,
  defaults: DesktopFilesIndexingConfig,
): DesktopFilesIndexingConfig {
  const providerRaw = parseString(
    readRaw("desktop.files.indexing.provider", profile),
    defaults.provider,
  );
  return {
    enabled: parseBool(
      readRaw("desktop.files.indexing.enabled", profile),
      defaults.enabled,
    ),
    provider: providerRaw === "fts5" ? "fts5" : defaults.provider,
    chunkChars: parseNumber(
      readRaw("desktop.files.indexing.chunk_chars", profile),
      defaults.chunkChars,
    ),
    overlapChars: parseNumber(
      readRaw("desktop.files.indexing.overlap_chars", profile),
      defaults.overlapChars,
    ),
    maxResults: parseNumber(
      readRaw("desktop.files.indexing.max_results", profile),
      defaults.maxResults,
    ),
  };
}

function readPreview(
  profile: string | undefined,
  defaults: DesktopFilesPreviewConfig,
): DesktopFilesPreviewConfig {
  return {
    markdown: parseBool(
      readRaw("desktop.files.preview.markdown", profile),
      defaults.markdown,
    ),
    mermaid: parseBool(
      readRaw("desktop.files.preview.mermaid", profile),
      defaults.mermaid,
    ),
    svg: parseBool(
      readRaw("desktop.files.preview.svg", profile),
      defaults.svg,
    ),
    artifact: parseBool(
      readRaw("desktop.files.preview.artifact", profile),
      defaults.artifact,
    ),
    pdf: parseBool(
      readRaw("desktop.files.preview.pdf", profile),
      defaults.pdf,
    ),
    externalNetwork: parseBool(
      readRaw("desktop.files.preview.external_network", profile),
      defaults.externalNetwork,
    ),
  };
}

function readCleanup(
  profile: string | undefined,
  defaults: DesktopFilesCleanupConfig,
): DesktopFilesCleanupConfig {
  return {
    orphanRetentionDays: parseNumber(
      readRaw("desktop.files.cleanup.orphan_retention_days", profile),
      defaults.orphanRetentionDays,
    ),
    tempRetentionHours: parseNumber(
      readRaw("desktop.files.cleanup.temp_retention_hours", profile),
      defaults.tempRetentionHours,
    ),
  };
}

/** Read `desktop.files.*` from profile config.yaml, merging with defaults. */
export function readDesktopFilesConfig(profile?: string): DesktopFilesConfig {
  const d = DEFAULT_DESKTOP_FILES_CONFIG;
  return {
    managedStorage: parseBool(
      readRaw("desktop.files.managed_storage", profile),
      d.managedStorage,
    ),
    copyPickerFiles: parseBool(
      readRaw("desktop.files.copy_picker_files", profile),
      d.copyPickerFiles,
    ),
    maxImportMb: parseNumber(
      readRaw("desktop.files.max_import_mb", profile),
      d.maxImportMb,
    ),
    maxParseMb: parseNumber(
      readRaw("desktop.files.max_parse_mb", profile),
      d.maxParseMb,
    ),
    maxInlineTextChars: parseNumber(
      readRaw("desktop.files.max_inline_text_chars", profile),
      d.maxInlineTextChars,
    ),
    parsing: readParsing(profile, d.parsing),
    indexing: readIndexing(profile, d.indexing),
    preview: readPreview(profile, d.preview),
    cleanup: readCleanup(profile, d.cleanup),
  };
}

/** Trim Main config to Renderer-safe capability flags. */
export function toFilesCapabilities(
  config: DesktopFilesConfig,
  extras?: { markitdownAvailable?: boolean },
): FilesCapabilities {
  const handlers = {
    listSession: true,
    getPreview: true,
    createFromMessage: true,
    saveAs: true,
    open: true,
    reveal: true,
  };
  return {
    managedStorage: config.managedStorage,
    copyPickerFiles: config.copyPickerFiles,
    maxImportMb: config.maxImportMb,
    maxParseMb: config.maxParseMb,
    maxInlineTextChars: config.maxInlineTextChars,
    parsingEnabled: config.parsing.enabled,
    indexingEnabled: config.indexing.enabled,
    markitdownAvailable: extras?.markitdownAvailable ?? false,
    preview: { ...config.preview },
    categories: [...ALL_CATEGORIES],
    handlers,
    available: Object.values(handlers).every(Boolean),
  };
}
