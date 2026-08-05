/**
 * Managed file layout under profileHome/desktop/files, plus staging wrappers.
 */

import { createHash, randomUUID } from "crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import {
  clearStagedAttachments,
  stageAttachment,
} from "../attachment-staging";
import { profileHome } from "../utils";
import { FilePlatformError } from "./file-security";

export { clearStagedAttachments, stageAttachment };

export interface FilesLayout {
  root: string;
  objects: string;
  parsed: string;
  previews: string;
  temp: string;
  dbPath: string;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Ensure the per-profile managed files directory tree exists. */
// @lat: [[file-platform#Storage]]
export function ensureFilesLayout(profile?: string): FilesLayout {
  const root = join(profileHome(profile), "desktop", "files");
  const objects = join(root, "objects");
  const parsed = join(root, "parsed");
  const previews = join(root, "previews");
  const temp = join(root, "temp");
  const dbPath = join(root, "file-index.db");

  ensureDir(root);
  ensureDir(objects);
  ensureDir(parsed);
  ensureDir(previews);
  ensureDir(temp);

  return { root, objects, parsed, previews, temp, dbPath };
}

/** Stream a file through SHA-256 and return the hex digest. */
export function hashFileStream(filePath: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", (err) => {
      reject(
        FilePlatformError.fromCode(
          "FILE_READ_FAILED",
          "Failed to hash file",
          { detail: err instanceof Error ? err.message : String(err) },
        ),
      );
    });
    stream.on("end", () => {
      resolvePromise(hash.digest("hex"));
    });
  });
}

/**
 * Copy `sourcePath` into objects/<prefix>/<hash> when missing.
 * Returns the managed absolute path.
 */
export async function storeManagedCopy(
  sourcePath: string,
  hash: string,
  profile?: string,
): Promise<string> {
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw FilePlatformError.fromCode(
      "FILE_STORAGE_FAILED",
      "Invalid content hash for managed copy",
    );
  }
  const normalized = hash.toLowerCase();
  const layout = ensureFilesLayout(profile);
  const prefix = normalized.slice(0, 2);
  const dir = join(layout.objects, prefix);
  ensureDir(dir);
  const target = join(dir, normalized);
  if (!existsSync(target)) {
    try {
      copyFileSync(sourcePath, target);
    } catch (err) {
      throw FilePlatformError.fromCode(
        "FILE_STORAGE_FAILED",
        "Failed to copy file into managed storage",
        { detail: err instanceof Error ? err.message : String(err) },
      );
    }
  }
  return target;
}

/** Write clipboard bytes through the existing staging helper. */
export function stageClipboardBytes(
  sessionId: string,
  filename: string,
  base64Bytes: string,
): string {
  return stageAttachment(sessionId, filename, base64Bytes);
}

/** Allocate a unique temp path under the profile files temp directory. */
export function allocateTempPath(
  filename: string,
  profile?: string,
): string {
  const layout = ensureFilesLayout(profile);
  const safe = (filename || "file").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return join(layout.temp, `${randomUUID()}-${safe.slice(0, 120)}`);
}
