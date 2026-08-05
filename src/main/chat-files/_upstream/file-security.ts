/**
 * FileSecurityPolicy enforcement: path canonicalize, denied extensions,
 * size limits, and magic-byte sniffing.
 */

import { existsSync, realpathSync } from "fs";
import { basename, resolve, sep } from "path";
import {
  DEFAULT_DENIED_EXTENSIONS,
  makeFileError,
  type DesktopFilesConfig,
  type FileError,
} from "../../shared/files";

export { DEFAULT_DENIED_EXTENSIONS };

export class FilePlatformError extends Error {
  readonly fileError: FileError;

  constructor(error: FileError) {
    super(error.message);
    this.name = "FilePlatformError";
    this.fileError = error;
  }

  static fromCode(
    code: FileError["code"],
    message: string,
    options?: { retryable?: boolean; detail?: string },
  ): FilePlatformError {
    return new FilePlatformError(makeFileError(code, message, options));
  }
}

export function extensionFromName(name: string): string {
  const base = basename(name || "");
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) {
    return base.toLowerCase();
  }
  return base.slice(dot + 1).toLowerCase();
}

export function isDeniedExtension(name: string): boolean {
  const ext = extensionFromName(name);
  return (DEFAULT_DENIED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Resolve to an absolute real path. Falls back to path.resolve when the
 * target does not exist yet (e.g. staging destination).
 */
// @lat: [[file-platform#Security]]
export function canonicalizePath(input: string): string {
  if (!input || typeof input !== "string") {
    throw FilePlatformError.fromCode(
      "FILE_PATH_OUTSIDE_POLICY",
      "Path is empty or invalid",
    );
  }
  if (input.includes("\0")) {
    throw FilePlatformError.fromCode(
      "FILE_PATH_OUTSIDE_POLICY",
      "Path contains a null byte",
    );
  }
  const absolute = resolve(input);
  try {
    const native = (
      realpathSync as typeof realpathSync & {
        native?: typeof realpathSync;
      }
    ).native;
    if (typeof native === "function" && existsSync(absolute)) {
      return native(absolute);
    }
    if (existsSync(absolute)) {
      return realpathSync(absolute);
    }
  } catch {
    // Fall through to resolved absolute path.
  }
  return absolute;
}

function isPathInside(root: string, candidate: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : root + sep;
  return candidate === root || candidate.startsWith(normalizedRoot);
}

/**
 * Ensure a path is allowed under the managed root policy.
 * When `allowOutsideManaged` is true, only null-byte / empty checks apply
 * (via canonicalize). When false, the path must stay under `managedRoot`.
 */
export function assertPathAllowed(
  filePath: string,
  options?: { allowOutsideManaged?: boolean; managedRoot?: string },
): void {
  const canonical = canonicalizePath(filePath);
  const allowOutside = options?.allowOutsideManaged === true;
  const managedRoot = options?.managedRoot
    ? canonicalizePath(options.managedRoot)
    : undefined;

  if (!allowOutside && managedRoot && !isPathInside(managedRoot, canonical)) {
    throw FilePlatformError.fromCode(
      "FILE_PATH_OUTSIDE_POLICY",
      "Path is outside the managed files root",
      { detail: "path-outside-managed-root" },
    );
  }
}

export type MagicKind = "image" | "pdf" | "zip" | "text" | "unknown";

/** Sniff common magic-byte signatures from a file prefix buffer. */
export function detectMagicKind(buf: Buffer): MagicKind {
  if (!buf || buf.length === 0) return "unknown";

  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "pdf"; // %PDF
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image"; // PNG
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image"; // JPEG
  }
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "image"; // GIF8
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image";
  }
  if (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07) &&
    (buf[3] === 0x04 || buf[3] === 0x06 || buf[3] === 0x08)
  ) {
    return "zip";
  }

  const sample = buf.subarray(0, Math.min(buf.length, 512));
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === 0) return "unknown";
    if (
      c === 0x09 ||
      c === 0x0a ||
      c === 0x0d ||
      (c >= 0x20 && c <= 0x7e) ||
      c >= 0x80
    ) {
      printable++;
    }
  }
  if (sample.length > 0 && printable / sample.length >= 0.85) {
    return "text";
  }
  return "unknown";
}

/**
 * Validate import name + size against desktop.files config.
 * Returns a FileError when denied, otherwise null.
 */
export function assertImportAllowed(
  name: string,
  size: number,
  config: DesktopFilesConfig,
): FileError | null {
  if (isDeniedExtension(name)) {
    return makeFileError(
      "FILE_TYPE_DENIED",
      `File type is not allowed: .${extensionFromName(name)}`,
      { detail: extensionFromName(name) },
    );
  }
  const maxBytes = Math.max(0, config.maxImportMb) * 1024 * 1024;
  if (size < 0) {
    return makeFileError("FILE_READ_FAILED", "Invalid file size");
  }
  if (size > maxBytes) {
    return makeFileError(
      "FILE_TOO_LARGE",
      `File exceeds the ${config.maxImportMb} MB import limit`,
      { detail: String(size) },
    );
  }
  return null;
}
