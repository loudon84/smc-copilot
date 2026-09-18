import type { FilePreviewFormat } from "../types";

const EXT_FORMAT: Record<string, FilePreviewFormat> = {
  md: "markdown",
  markdown: "markdown",
  txt: "txt",
  text: "txt",
  html: "html",
  htm: "html",
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  json: "json",
  js: "code",
  ts: "code",
  tsx: "code",
  jsx: "code",
  py: "code",
  rs: "code",
  go: "code",
  java: "code",
  c: "code",
  cpp: "code",
  css: "code",
  xml: "code",
  yaml: "code",
  yml: "code",
  docx: "docx",
};

const MIME_FORMAT: Record<string, FilePreviewFormat> = {
  "text/markdown": "markdown",
  "text/plain": "txt",
  "text/html": "html",
  "application/pdf": "pdf",
  "application/json": "json",
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

export function extensionOf(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function detectFormat(input: {
  name?: string;
  mime?: string | null;
}): FilePreviewFormat {
  if (input.mime) {
    const mimeKey = input.mime.split(";")[0]?.trim().toLowerCase() ?? "";
    if (mimeKey && MIME_FORMAT[mimeKey]) return MIME_FORMAT[mimeKey];
    if (mimeKey.startsWith("image/")) return "image";
    if (mimeKey.startsWith("text/")) return "txt";
  }
  if (input.name) {
    const ext = extensionOf(input.name);
    if (ext && EXT_FORMAT[ext]) return EXT_FORMAT[ext];
  }
  return "unsupported";
}
