/**
 * Main-only Expert artifact download → File Platform ingest.
 * Accepts artifact_id only; never trusts Renderer URLs or nullable download_url.
 */

import { randomUUID } from "crypto";
import {
  createWriteStream,
  existsSync,
  renameSync,
  rmSync,
  statSync,
} from "fs";
import { basename, extname } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { FileAssociation, ManagedFile } from "../../shared/files";
import { emitFileDomainEvent } from "../files/file-domain-events";
import {
  findByHash,
  insertAssociation,
  normalizeProfileId,
  upsertManagedFile,
} from "../files/file-association-store";
import { resolveFileCategory, resolveMime } from "../files/file-category";
import { nowIso } from "../files/file-metadata";
import {
  allocateTempPath,
  ensureFilesLayout,
  hashFileStream,
  storeManagedCopy,
} from "../files/file-store";
import {
  ExpertGatewayError,
  getExpertGatewayClient,
} from "./expert-gateway-client";

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const activeTempFiles = new Set<string>();

function sanitizeFileName(name: string): string {
  const base = basename(name || "artifact.bin").replace(
    /[<>:"/\\|?*\x00-\x1F]/g,
    "_",
  );
  return base.slice(0, 180) || "artifact.bin";
}

function extensionFromName(name: string): string {
  return extname(name).replace(/^\./, "").toLowerCase() || "bin";
}

function conservativeMime(fileName: string, contentType: string | null): string {
  const fromName = resolveMime(fileName);
  if (fromName && fromName !== "application/octet-stream") return fromName;
  if (contentType && !contentType.includes("*")) {
    const allowed = new Set([
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (allowed.has(mime)) return mime;
  }
  return "application/octet-stream";
}

function cleanupTemp(path: string): void {
  activeTempFiles.delete(path);
  if (existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function downloadExpertArtifact(input: {
  taskId: string;
  artifactId: string;
  sessionId: string;
  profileId?: string;
}): Promise<{ fileId: string }> {
  const taskId = input.taskId.trim();
  const artifactId = input.artifactId.trim();
  const sessionId = input.sessionId.trim();
  if (!taskId || !artifactId || !sessionId) {
    throw new ExpertGatewayError(
      "taskId, artifactId, and sessionId are required",
      { status: 400 },
    );
  }

  const gateway = getExpertGatewayClient();
  const artifacts = await gateway.listArtifacts(taskId);
  const meta = artifacts.find((item) => item.id === artifactId);
  if (!meta) {
    throw new ExpertGatewayError("Artifact not found for task", {
      status: 404,
      errorCode: "ARTIFACT_NOT_FOUND",
    });
  }
  if (meta.task_id && meta.task_id !== taskId) {
    throw new ExpertGatewayError("Artifact task mismatch", {
      status: 403,
      errorCode: "ARTIFACT_TASK_MISMATCH",
    });
  }

  const profileId = normalizeProfileId(input.profileId);
  const profileArg = profileId === "default" ? undefined : profileId;
  ensureFilesLayout(profileArg);

  const safeName = sanitizeFileName(meta.file_name);
  const tempPath = allocateTempPath(safeName, profileArg);
  const partialPath = `${tempPath}.partial`;
  activeTempFiles.add(partialPath);
  activeTempFiles.add(tempPath);

  try {
    const downloadPath = gateway.buildArtifactDownloadPath(artifactId);
    const res = await gateway.openAuthorizedGet(downloadPath, {
      headers: { Accept: "*/*" },
    });
    if (!res.ok || !res.body) {
      throw new ExpertGatewayError(`Artifact download failed: ${res.status}`, {
        status: res.status,
      });
    }
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (contentLength > MAX_ARTIFACT_BYTES) {
      throw new ExpertGatewayError("Artifact exceeds size limit", {
        status: 413,
        errorCode: "ARTIFACT_TOO_LARGE",
      });
    }

    const nodeStream = Readable.fromWeb(
      res.body as import("stream/web").ReadableStream,
    );
    let downloaded = 0;
    nodeStream.on("data", (chunk: Buffer) => {
      downloaded += chunk.length;
      if (downloaded > MAX_ARTIFACT_BYTES) {
        nodeStream.destroy(
          new ExpertGatewayError("Artifact exceeds size limit", {
            status: 413,
            errorCode: "ARTIFACT_TOO_LARGE",
          }),
        );
      }
    });

    await pipeline(nodeStream, createWriteStream(partialPath));
    renameSync(partialPath, tempPath);
    activeTempFiles.delete(partialPath);

    const hash = await hashFileStream(tempPath);
    const absolutePath = await storeManagedCopy(tempPath, hash, profileArg);
    const size = statSync(tempPath).size;
    const mime = conservativeMime(
      safeName,
      typeof meta.content_type === "string" ? meta.content_type : null,
    );
    const category = resolveFileCategory(safeName, mime);
    const ts = nowIso();

    const byHash = findByHash(profileId, hash);
    let fileId: string;
    let managed: ManagedFile;
    if (byHash) {
      fileId = byHash.id;
      managed = {
        ...byHash,
        source: "agent-output",
        status: "ready",
        managedPath: byHash.managedPath || absolutePath,
        originalPath: byHash.originalPath || absolutePath,
        updatedAt: ts,
      };
      upsertManagedFile(managed);
    } else {
      fileId = randomUUID();
      managed = {
        id: fileId,
        profileId,
        name: safeName,
        extension: extensionFromName(safeName),
        mime,
        category,
        source: "agent-output",
        status: "ready",
        size,
        originalPath: absolutePath,
        managedPath: absolutePath,
        contentHash: hash,
        createdAt: ts,
        updatedAt: ts,
      };
      upsertManagedFile(managed);
    }

    const association: FileAssociation = {
      id: randomUUID(),
      fileId,
      profileId,
      sessionId,
      messageId: `expert-artifact:${taskId}:${artifactId}`,
      role: "agent-output",
      ordinal: 0,
      createdAt: ts,
    };
    insertAssociation(association);
    emitFileDomainEvent({
      type: "file:created",
      fileId,
      sessionId,
      role: "agent-output",
    });
    emitFileDomainEvent({
      type: "file:association-created",
      fileId,
      sessionId,
      role: "agent-output",
    });

    cleanupTemp(tempPath);
    return { fileId };
  } catch (err) {
    cleanupTemp(partialPath);
    cleanupTemp(tempPath);
    throw err;
  }
}

/** Logout / dispose: remove any in-flight partial downloads. */
export function cleanupExpertArtifactTemps(): void {
  for (const path of Array.from(activeTempFiles)) {
    cleanupTemp(path);
  }
  activeTempFiles.clear();
}
