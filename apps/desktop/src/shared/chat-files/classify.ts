/**
 * Category / extension helpers for ManagedFile classification.
 */

import type { ManagedFileCategory } from "./managed-file";
import { getFileExtension } from "../attachments";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);
const MARKDOWN_EXT = new Set(["md", "markdown", "mdx"]);
const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "java",
  "go",
  "rs",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "rb",
  "php",
  "swift",
  "kt",
  "sql",
  "sh",
  "bash",
  "zsh",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "css",
  "scss",
  "html",
  "htm",
  "vue",
  "svelte",
]);
const TEXT_EXT = new Set(["txt", "text", "log", "csv", "tsv", "ini", "env"]);
const OFFICE_EXT = new Set(["docx", "doc"]);
const SPREADSHEET_EXT = new Set(["xlsx", "xls", "ods"]);
const PRESENTATION_EXT = new Set(["pptx", "ppt"]);
const ARCHIVE_EXT = new Set(["zip", "tar", "gz", "tgz", "rar", "7z"]);

export function classifyFileCategory(
  name: string,
  mime?: string,
): ManagedFileCategory {
  const ext = getFileExtension(name);
  const lowerMime = (mime ?? "").toLowerCase();

  if (lowerMime.startsWith("image/") || IMAGE_EXT.has(ext)) return "image";
  if (ext === "pdf" || lowerMime === "application/pdf") return "pdf";
  if (ext === "epub") return "epub";
  if (MARKDOWN_EXT.has(ext)) return "markdown";
  if (OFFICE_EXT.has(ext)) return "office";
  if (SPREADSHEET_EXT.has(ext)) return "spreadsheet";
  if (PRESENTATION_EXT.has(ext)) return "presentation";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (ext === "html" || ext === "htm" || lowerMime === "text/html")
    return "html";
  if (CODE_EXT.has(ext)) return "code";
  if (TEXT_EXT.has(ext) || lowerMime.startsWith("text/")) return "text";
  return "unknown";
}

export function guessMime(name: string, fallback = "application/octet-stream"): string {
  const ext = getFileExtension(name);
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    epub: "application/epub+zip",
  };
  return map[ext] ?? fallback;
}
