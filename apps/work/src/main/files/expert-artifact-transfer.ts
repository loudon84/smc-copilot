/**
 * Stream Expert artifact bytes through a partial file with size + optional sha256 gates.
 * Used by Preview cache, Materialize, and user Download.
 */

import {
  createWriteStream,
  existsSync,
  renameSync,
  rmSync,
} from "fs";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  ExpertGatewayError,
  getExpertGatewayClient,
} from "../expert/expert-gateway-client";
import { readDesktopFilesConfig } from "./file-config";
import { FilePlatformError } from "./file-security";
import {
  allocateTempPath,
  ensureFilesLayout,
  hashFileStream,
} from "./file-store";

function cleanupPath(path: string): void {
  if (existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export interface StreamExpertArtifactBytesInput {
  artifactId: string;
  /** Expected sha256 hex when provider supplied it. */
  expectedSha256?: string;
  profile?: string;
  /** Override destination path (user Download). Default: temp under files layout. */
  destinationPath?: string;
  /** Cap in bytes; defaults to desktop.files.preview.maxTransferMb. */
  maxBytes?: number;
  signal?: AbortSignal;
}

export interface StreamExpertArtifactBytesResult {
  path: string;
  hash: string;
  size: number;
}

/**
 * Download authorized artifact bytes to a final path via `{path}.partial`.
 * On cancel/failure/integrity mismatch, removes partial and destination.
 */
export async function streamExpertArtifactBytes(
  input: StreamExpertArtifactBytesInput,
): Promise<StreamExpertArtifactBytesResult> {
  const artifactId = input.artifactId.trim();
  if (!artifactId) {
    throw FilePlatformError.fromCode(
      "FILE_NOT_FOUND",
      "Artifact id is required",
    );
  }

  const config = readDesktopFilesConfig(input.profile);
  const maxBytes =
    input.maxBytes ??
    Math.max(1, config.preview.maxTransferMb) * 1024 * 1024;

  const profileArg =
    input.profile && input.profile !== "default" ? input.profile : undefined;
  ensureFilesLayout(profileArg);

  const finalPath =
    input.destinationPath ??
    allocateTempPath(`expert-${artifactId}.bin`, profileArg);
  const partialPath = `${finalPath}.partial`;
  cleanupPath(partialPath);

  const gateway = getExpertGatewayClient();
  try {
    const downloadPath = gateway.buildArtifactDownloadPath(artifactId);
    const res = await gateway.openAuthorizedGet(downloadPath, {
      headers: { Accept: "*/*" },
      signal: input.signal,
    });
    if (!res.ok || !res.body) {
      if (res.status === 403) {
        throw FilePlatformError.fromCode(
          "FILE_REMOTE_FORBIDDEN",
          "Artifact download forbidden",
          { detail: String(res.status) },
        );
      }
      if (res.status === 404) {
        throw FilePlatformError.fromCode(
          "FILE_REMOTE_NOT_FOUND",
          "Artifact not found",
          { detail: String(res.status) },
        );
      }
      throw FilePlatformError.fromCode(
        "FILE_REMOTE_UNAVAILABLE",
        `Artifact download failed: ${res.status}`,
        { retryable: res.status >= 500, detail: String(res.status) },
      );
    }

    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > maxBytes) {
      throw FilePlatformError.fromCode(
        "FILE_TOO_LARGE",
        "Artifact exceeds size limit",
        { detail: String(contentLength) },
      );
    }

    const nodeStream = Readable.fromWeb(
      res.body as import("stream/web").ReadableStream,
    );
    let downloaded = 0;
    nodeStream.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      if (downloaded > maxBytes) {
        nodeStream.destroy(
          FilePlatformError.fromCode(
            "FILE_TOO_LARGE",
            "Artifact exceeds size limit",
          ),
        );
      }
    });

    await pipeline(nodeStream, createWriteStream(partialPath));
    const hash = await hashFileStream(partialPath);
    if (
      input.expectedSha256 &&
      hash.toLowerCase() !== input.expectedSha256.trim().toLowerCase()
    ) {
      cleanupPath(partialPath);
      throw FilePlatformError.fromCode(
        "FILE_INTEGRITY_MISMATCH",
        "Downloaded bytes do not match provider sha256",
      );
    }

    cleanupPath(finalPath);
    renameSync(partialPath, finalPath);
    return { path: finalPath, hash, size: downloaded };
  } catch (err) {
    cleanupPath(partialPath);
    if (input.destinationPath) cleanupPath(finalPath);
    else cleanupPath(finalPath);
    if (err instanceof FilePlatformError || err instanceof ExpertGatewayError) {
      throw err;
    }
    throw FilePlatformError.fromCode(
      "FILE_REMOTE_UNAVAILABLE",
      err instanceof Error ? err.message : "Artifact transfer failed",
      { retryable: true },
    );
  }
}

/** Preview-cache path under files/previews keyed by remote identity (+ hash). */
export function resolvePreviewCachePath(input: {
  profile?: string;
  provider: string;
  remoteArtifactId: string;
  remoteRunId?: string;
  contentHash?: string;
}): string {
  const layout = ensureFilesLayout(
    input.profile && input.profile !== "default" ? input.profile : undefined,
  );
  const key = [
    input.provider,
    input.remoteRunId || "norun",
    input.remoteArtifactId,
    input.contentHash?.slice(0, 16) || "nohash",
  ].join("_");
  const safe = key.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 180);
  return join(layout.previews, `remote_${safe}`);
}

export function invalidatePreviewCache(input: {
  profile?: string;
  provider: string;
  remoteArtifactId: string;
  contentHash?: string;
}): void {
  cleanupPath(resolvePreviewCachePath(input));
}
