import {
  createWriteStream,
  existsSync,
  renameSync,
  rmSync,
} from "fs";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createAuthorizedBackendTransport } from "../auth/authorized-backend-transport";
import { readDesktopFilesConfig } from "../files/file-config";
import { FilePlatformError } from "../files/file-security";
import { allocateTempPath, hashFileStream } from "../files/file-store";
import { RemoteExpertError } from "../../shared/remote-expert";
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
    throw new RemoteExpertError(
      "REMOTE_EXPERT_RESOURCE_DENIED",
      "invalid artifact uri",
    );
  }
  if (parsed.protocol !== "nodeskclaw:") {
    throw new RemoteExpertError(
      "CROSS_ORIGIN_REJECTED",
      "unsupported scheme",
    );
  }
  if (
    uri.includes("..") ||
    uri.includes("%2e") ||
    uri.includes("%2E") ||
    uri.includes("%2f") ||
    uri.includes("%2F")
  ) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_RESOURCE_DENIED",
      "path traversal rejected",
    );
  }
  const host = parsed.hostname || parsed.host;
  const parts = parsed.pathname.split("/").filter(Boolean);
  const segs = host === "artifact" ? parts : [host, ...parts].filter(Boolean);
  if (host !== "artifact" && segs[0] !== "artifact") {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_RESOURCE_DENIED",
      "not an artifact uri",
    );
  }
  const runId = host === "artifact" ? parts[0] : segs[1];
  const artifactId = host === "artifact" ? parts[1] : segs[2];
  if (!runId || !artifactId || parts.length > 2 && host === "artifact") {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_RESOURCE_DENIED",
      "artifact uri shape invalid",
    );
  }
  return { runId, artifactId };
}

export function publicArtifactPath(
  agentRef: string,
  runId: string,
  artifactId: string,
): string {
  return `/api/v1/remote-experts/${encodeURIComponent(agentRef)}/acp/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`;
}

export function assertDownloadPathMatches(
  agentRef: string,
  runId: string,
  artifactId: string,
  downloadPath: string | undefined,
): void {
  if (!downloadPath) return;
  const expected = publicArtifactPath(agentRef, runId, artifactId);
  if (downloadPath !== expected && downloadPath.split("?")[0] !== expected) {
    throw new RemoteExpertError(
      "CROSS_ORIGIN_REJECTED",
      "downloadPath does not match public artifact route",
    );
  }
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

function mapDownloadStatus(status: number): never {
  if (status === 403) {
    throw new RemoteExpertError(
      "FILE_REMOTE_FORBIDDEN",
      "artifact forbidden",
    );
  }
  if (status === 404) {
    throw new RemoteExpertError("FILE_REMOTE_NOT_FOUND", "artifact missing");
  }
  throw new RemoteExpertError(
    "FILE_REMOTE_UNAVAILABLE",
    `artifact HTTP ${status}`,
  );
}

export async function streamRemoteExpertAcpArtifactBytes(input: {
  agentRef: string;
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
    const res = await transport.authorizedFetch(
      publicArtifactPath(input.agentRef, input.runId, input.artifactId),
      { method: "GET", signal: input.signal },
    );
    if (!res.ok || !res.body) mapDownloadStatus(res.status);
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
    const expected = (input.expectedSha256 || "").toLowerCase();
    if (expected && hash.toLowerCase() !== expected) {
      cleanupPath(partialPath);
      throw new RemoteExpertError(
        "FILE_INTEGRITY_MISMATCH",
        "checksum mismatch",
      );
    }
    cleanupPath(finalPath);
    renameSync(partialPath, finalPath);
    return { path: finalPath, hash, size: downloaded };
  } catch (err) {
    cleanupPath(partialPath);
    if (err instanceof RemoteExpertError || err instanceof FilePlatformError) {
      throw err;
    }
    throw new RemoteExpertError(
      "FILE_REMOTE_UNAVAILABLE",
      "artifact download failed",
    );
  }
}

export function upsertRemoteExpertAcpArtifact(input: {
  profileId: string;
  sessionId: string;
  agentRef: string;
  uri: string;
  downloadPath?: string;
  name?: string;
  checksumSha256?: string;
  mime?: string;
  size?: number;
}): { fileId: string; name: string; uri: string } {
  const parsed = parseArtifactResourceUri(input.uri);
  assertDownloadPathMatches(
    input.agentRef,
    parsed.runId,
    parsed.artifactId,
    input.downloadPath,
  );
  const existing = findByRemoteIdentity({
    profileId: input.profileId,
    provider: "remote-expert-acp",
    remoteArtifactId: parsed.artifactId,
    remoteRunId: parsed.runId,
  });
  const now = nowIso();
  const name = sanitizeGeneratedFileName(input.name || "artifact.bin");
  const file: ManagedFile = existing ?? {
    id: randomUUID(),
    profileId: normalizeProfileId(input.profileId),
    name,
    extension: name.includes(".") ? name.slice(name.lastIndexOf(".")) : "",
    mime: input.mime || resolveMime(name),
    category: resolveFileCategory(name),
    source: "agent-output",
    status: "ready",
    size: input.size ?? 0,
    createdAt: now,
    updatedAt: now,
    locality: "remote",
    provider: "remote-expert-acp",
    remoteArtifactId: parsed.artifactId,
    remoteRunId: parsed.runId,
    remoteTaskId: input.agentRef,
    contentHash: input.checksumSha256,
    availability: "available",
  };
  if (existing) {
    existing.updatedAt = now;
    existing.remoteTaskId = input.agentRef;
    upsertManagedFile(existing);
  } else {
    upsertManagedFile(file);
    if (
      !findAssociation({
        profileId: file.profileId,
        fileId: file.id,
        sessionId: input.sessionId,
        role: "agent-output",
      })
    ) {
      insertAssociation({
      id: randomUUID(),
      fileId: file.id,
      profileId: file.profileId,
      sessionId: input.sessionId,
      role: "agent-output",
      ordinal: 0,
      createdAt: now,
    });
    }
    emitFileDomainEvent({
      type: "file:created",
      fileId: file.id,
      sessionId: input.sessionId,
      role: "agent-output",
    });
  }
  return { fileId: existing?.id ?? file.id, name, uri: input.uri };
}

export function resolveAgentRefForRemoteFile(file: ManagedFile): string {
  if (file.remoteTaskId) return file.remoteTaskId;
  throw new RemoteExpertError(
    "FILE_REMOTE_NOT_FOUND",
    "artifact agentRef missing",
  );
}
