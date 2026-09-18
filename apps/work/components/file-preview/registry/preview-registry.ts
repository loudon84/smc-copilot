import type {
  FilePreviewEngineCapability,
  FilePreviewFormat,
} from "../types";

/** FP-001 capability table for open-file-viewer phase-1 engine. */
const CAPABILITY: Record<FilePreviewFormat, FilePreviewEngineCapability> = {
  markdown: "must",
  txt: "must",
  html: "must",
  pdf: "must",
  image: "must",
  json: "must",
  code: "must",
  docx: "should",
  unsupported: "unsupported",
};

export function capabilityFor(format: FilePreviewFormat): FilePreviewEngineCapability {
  return CAPABILITY[format];
}

export function isPreviewable(format: FilePreviewFormat): boolean {
  const cap = capabilityFor(format);
  return cap === "must" || cap === "should";
}
