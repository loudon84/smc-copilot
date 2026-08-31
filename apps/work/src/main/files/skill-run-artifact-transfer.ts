/**
 * Stream Skill Run artifact bytes through a partial file with size + optional sha256 gates.
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
  SkillRunGatewayError,
} from "../skill-run/skill-run-gateway-client";
import { createAuthorizedBackendTransport } from "../auth/authorized-backend-transport";
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

export interface StreamSkillRunArtifactBytesInput {
  artifactId: string;
  runId?: string;
  expectedSha256?: string;
  profile?: string;
  destinationPath?: string;
  maxBytes?: number;
  signal?: AbortSignal;
}

export interface StreamSkillRunArtifactBytesResult {
  path: string;
  hash: string;
  size: number;
}

export async function streamSkillRunArtifactBytes(
  input: StreamSkillRunArtifactBytesInput,
): Promise<StreamSkillRunArtifactBytesResult> {
  const artifactId = input.artifactId.trim();
  if (!artifactId) {
    throw FilePlatformError.fromCode("FILE_NOT_FOUND", "Missing artifactId");
  }

  const transport = createAuthorizedBackendTransport();
  const cfg = readDesktopFilesConfig();
  const cap = input.maxBytes ?? cfg.preview.maxTransferMb * 1024 * 1024;
  const finalPath =
    input.destinationPath ??
    allocateTempPath({
      profile: input.profile,
      extension: "bin",
      prefix: "skill_art_",
    });
  const partialPath = `${finalPath}.partial`;

  cleanupPath(partialPath);

  try {
    const url = input.runId
      ? `/api/v1/runs/${encodeURIComponent(input.runId)}/artifacts/${encodeURIComponent(artifactId)}/download`
      : `/api/v1/artifacts/${encodeURIComponent(artifactId)}/download`;

    const res = await transport.authorizedFetch(url, {
      method: "GET",
      signal: input.signal,
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw FilePlatformError.fromCode(
          "FILE_NOT_FOUND",
          `Remote artifact not found: ${artifactId}`,
        );
      }
      if (res.status === 401 || res.status === 403) {
        throw FilePlatformError.fromCode(
          "FILE_PERMISSION_DENIED",
          "Artifact download forbidden",
        );
      }
      throw FilePlatformError.fromCode(
        "FILE_REMOTE_UNAVAILABLE",
        `Artifact download failed: ${res.status}`,
        { retryable: true },
      );
    }

    if (!res.body) {
      throw FilePlatformError.fromCode(
        "FILE_REMOTE_UNAVAILABLE",
        "Artifact download body empty",
      );
    }

    const nodeStream = Readable.fromWeb(
      res.body as unknown as import("stream/web").ReadableStream<Uint8Array>,
    );

    let downloaded = 0;
    nodeStream.on("data", (chunk: Buffer | Uint8Array) => {
      downloaded += chunk.length;
      if (downloaded > cap) {
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
    cleanupPath(finalPath);
    if (err instanceof FilePlatformError || err instanceof SkillRunGatewayError) {
      throw err;
    }
    throw FilePlatformError.fromCode(
      "FILE_REMOTE_UNAVAILABLE",
      err instanceof Error ? err.message : "Skill artifact transfer failed",
      { retryable: true },
    );
  }
}
