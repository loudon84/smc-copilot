import {
  createWriteStream,
  existsSync,
  renameSync,
  rmSync,
} from "fs";
import { extname } from "path";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createAuthorizedBackendTransport } from "../auth/authorized-backend-transport";
import { readDesktopFilesConfig } from "../files/file-config";
import { FilePlatformError } from "../files/file-security";
import { allocateTempPath, hashFileStream } from "../files/file-store";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import type { ManagedFile } from "../../shared/files";
import { emitFileDomainEvent } from "../files/file-domain-events";
import {
  findAssociation,
  findByRemoteIdentity,
  insertAssociation,
  normalizeProfileId,
  upsertManagedFile,
} from "../files/file-association-store";
import { resolveFileCategory, resolveMime } from "../files/file-category";
import { nowIso } from "../files/file-metadata";
import { sanitizeGeneratedFileName } from "../files/agent-output/generated-file-name";

export interface ParsedArtifactUri {
  runId: string;
  artifactId: string;
}

export function parseArtifactResourceUri(uri: string): ParsedArtifactUri {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new RemoteExpertError("REMOTE_ARTIFACT_URI_INVALID", "invalid artifact uri");
  }
  if (parsed.protocol !== "nodeskclaw:") {
    throw new RemoteExpertError("REMOTE_ARTIFACT_URI_INVALID", "unsupported scheme");
  }
  if (uri.includes("..") || uri.includes("%2e") || uri.includes("%2E") || uri.includes("%2f") || uri.includes("%2F")) {
    throw new RemoteExpertError("REMOTE_ARTIFACT_URI_INVALID", "path traversal rejected");
  }
  const host = parsed.hostname || parsed.host;
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (host === "artifact") {
    if (parts.length !== 2) {
      throw new RemoteExpertError("REMOTE_ARTIFACT_URI_INVALID", "artifact uri shape invalid");
    }
    return { runId: parts[0], artifactId: parts[1] };
  }
  const segs = [host, ...parts].filter(Boolean);
  if (segs[0] !== "artifact" || segs.length !== 3) {
    throw new RemoteExpertError("REMOTE_ARTIFACT_URI_INVALID", "artifact uri shape invalid");
  }
  const runId = segs[1];
  const artifactId = segs[2];
  if (!runId || !artifactId || /[\\/]/.test(runId) || /[\\/]/.test(artifactId)) {
    throw new RemoteExpertError("REMOTE_ARTIFACT_URI_INVALID", "artifact identity invalid");
  }
  return { runId, artifactId };
}

function cleanupPath(path: string): void {
  if (existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function streamRemoteExpertAcpArtifactBytes(input: {
  runId: string;
  artifactId: string;
  expectedSha256?: string;
  profile?: string;
  destinationPath?: string;
  maxBytes?: number;
  signal?: AbortSignal;
}): Promise<{ path: string; hash: string; size: number }> {
  const transport = createAuthorizedBackendTransport();
  const cfg = readDesktopFilesConfig();
  const cap = input.maxBytes ?? cfg.preview.maxTransferMb * 1024 * 1024;
  const profileArg =
    input.profile && input.profile !== "default" ? input.profile : undefined;
  const finalPath =
    input.destinationPath ??
    allocateTempPath(`remote-acp-${input.artifactId}.bin`, profileArg);
  const partialPath = `${finalPath}.partial`;
  cleanupPath(partialPath);
  try {
    const metaRes = await transport.authorizedFetch(
      `/api/v1/remote-agent/runs/${encodeURIComponent(input.runId)}/artifacts`,
      { method: "GET", signal: input.signal },
    );
    if (!metaRes.ok) {
      throw new RemoteExpertError("REMOTE_ARTIFACT_DOWNLOAD_FAILED", "artifact list failed");
    }
    const meta = (await metaRes.json()) as { items?: Array<{ artifact_id?: string; checksum_sha256?: string }> };
    const item = (meta.items ?? []).find((entry) => entry.artifact_id === input.artifactId);
    const expected = (input.expectedSha256 || item?.checksum_sha256 || "").toLowerCase();

    const res = await transport.authorizedFetch(
      `/api/v1/remote-agent/runs/${encodeURIComponent(input.runId)}/artifacts/${encodeURIComponent(input.artifactId)}`,
      { method: "GET", signal: input.signal },
    );
    if (!res.ok || !res.body) {
      throw new RemoteExpertError("REMOTE_ARTIFACT_DOWNLOAD_FAILED", `download ${res.status}`);
    }
    const nodeStream = Readable.fromWeb(
      res.body as unknown as import("stream/web").ReadableStream<Uint8Array>,
    );
    let downloaded = 0;
    nodeStream.on("data", (chunk: Buffer | Uint8Array) => {
      downloaded += chunk.length;
      if (downloaded > cap) {
        nodeStream.destroy(
          FilePlatformError.fromCode("FILE_TOO_LARGE", "Artifact exceeds size limit"),
        );
      }
    });
    await pipeline(nodeStream, createWriteStream(partialPath));
    const hash = await hashFileStream(partialPath);
    if (expected && hash.toLowerCase() !== expected) {
      cleanupPath(partialPath);
      throw new RemoteExpertError("REMOTE_ARTIFACT_INTEGRITY_FAILED", "checksum mismatch");
    }
    cleanupPath(finalPath);
    renameSync(partialPath, finalPath);
    return { path: finalPath, hash, size: downloaded };
  } catch (err) {
    cleanupPath(partialPath);
    if (err instanceof RemoteExpertError || err instanceof FilePlatformError) throw err;
    throw new RemoteExpertError("REMOTE_ARTIFACT_DOWNLOAD_FAILED", "artifact download failed");
  }
}

export function upsertRemoteExpertAcpArtifact(input: {
  profileId: string;
  sessionId: string;
  uri: string;
  name?: string;
  checksumSha256?: string;
  mime?: string;
  size?: number;
}): { fileId: string; name: string; uri: string } {
  const parsed = parseArtifactResourceUri(input.uri);
  const existing = findByRemoteIdentity({
    profileId: input.profileId,
    provider: "remote-expert-acp",
    remoteArtifactId: parsed.artifactId,
    remoteRunId: parsed.runId,
  });
  const now = nowIso();
  const rawName = (input.name || parsed.artifactId).trim() || "artifact.bin";
  const name = sanitizeGeneratedFileName(rawName);
  const extension = extname(name).replace(/^\./, "").toLowerCase() || "bin";
  const mime = input.mime?.trim() || resolveMime(extension);
  const category = resolveFileCategory(extension, mime);
  const fileId = existing?.id ?? randomUUID();
  const file: ManagedFile = {
    id: fileId,
    profileId: normalizeProfileId(input.profileId),
    name,
    extension,
    mime,
    category,
    source: "agent-output",
    status: "ready",
    size: input.size && input.size > 0 ? input.size : existing?.size ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    locality: "remote",
    provider: "remote-expert-acp",
    remoteArtifactId: parsed.artifactId,
    remoteRunId: parsed.runId,
    availability: "available",
    providerPreviewSupported: false,
    canPreview: category === "pdf" || category === "image" || category === "text" || category === "markdown" || category === "code" || category === "html",
    contentHash: input.checksumSha256?.toLowerCase() ?? existing?.contentHash,
  };
  upsertManagedFile(file);
  const existingAssoc = input.sessionId
    ? findAssociation({
        profileId: file.profileId,
        fileId,
        sessionId: input.sessionId,
        role: "agent-output",
      })
    : null;
  if (!existingAssoc && input.sessionId) {
    insertAssociation({
      id: randomUUID(),
      fileId,
      profileId: file.profileId,
      sessionId: input.sessionId,
      role: "agent-output",
      ordinal: 0,
      createdAt: now,
    });
  }
  emitFileDomainEvent({
    type: "file:created",
    fileId,
    sessionId: input.sessionId || undefined,
    role: "agent-output",
  });
  return { fileId, name, uri: input.uri };
}
