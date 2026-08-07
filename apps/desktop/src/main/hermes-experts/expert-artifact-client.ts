/**
 * Expert Gateway task artifact fetch (v7.5).
 * Main Process fetches artifact content with Bearer token — Renderer never holds token.
 */
import { app } from "electron";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { getDeviceIdentity } from "../genehub/device-identity";
import { getMcpAccessToken } from "../mcp-skill-gateway-runtime/mcp-token-provider";
import type {
  ExpertArtifact,
  ExpertArtifactDownloadInput,
  ExpertArtifactDownloadResult,
  ExpertArtifactPreview,
  ExpertArtifactPreviewInput,
} from "../../shared/hermes-experts/expert-task-stream-contract";
import { HermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";

const PREVIEW_MAX_BYTES = 256 * 1024;
const artifactCache = new Map<string, ExpertArtifact[]>();

function clientVersionHeader(): string {
  return `copilot-desktop/${app.getVersion()}`;
}

function buildAuthHeaders(accept: string): Record<string, string> {
  const token = getMcpAccessToken();
  if (!token) {
    throw new HermesExpertsError("NODESKCLAW_UNAUTHORIZED", "Desktop login required");
  }
  const device = getDeviceIdentity();
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "X-NoDeskClaw-Desktop-Device-Id": device.deviceFingerprint,
    "X-NoDeskClaw-Client": "copilot-desktop",
    "X-Client-Version": clientVersionHeader(),
  };
}

function resolveArtifactUrl(input: ExpertArtifactPreviewInput | ExpertArtifactDownloadInput): string {
  const url = input.artifactUrl?.trim();
  if (url) return url;
  throw new HermesExpertsError("ARTIFACT_NOT_FOUND", "artifactUrl is required");
}

function downloadsDir(): string {
  const dir = join(app.getPath("downloads"), "hermes-expert-artifacts");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function safeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "_").slice(0, 120) || "artifact";
}

export function cacheTaskArtifact(taskId: string, artifact: ExpertArtifact): void {
  const list = artifactCache.get(taskId) ?? [];
  const exists = list.some(
    (a) =>
      (artifact.artifactId && a.artifactId === artifact.artifactId) ||
      (artifact.artifactUrl && a.artifactUrl === artifact.artifactUrl),
  );
  if (!exists) {
    list.push(artifact);
    artifactCache.set(taskId, list);
  }
}

export function listExpertTaskArtifacts(taskId: string): ExpertArtifact[] {
  return artifactCache.get(taskId) ?? [];
}

export async function previewExpertArtifact(
  input: ExpertArtifactPreviewInput,
): Promise<ExpertArtifactPreview> {
  const url = resolveArtifactUrl(input);
  const res = await fetch(url, {
    method: "GET",
    headers: buildAuthHeaders("text/plain, application/json, */*"),
  });
  if (!res.ok) {
    throw new HermesExpertsError("ARTIFACT_NOT_FOUND", `HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") ?? "text/plain";
  const buf = Buffer.from(await res.arrayBuffer());
  const truncated = buf.length > PREVIEW_MAX_BYTES;
  const text = buf.subarray(0, PREVIEW_MAX_BYTES).toString("utf-8");

  if (input.taskId && input.artifactId) {
    cacheTaskArtifact(input.taskId, {
      artifactId: input.artifactId,
      taskId: input.taskId,
      name: input.artifactId,
      mimeType: contentType,
      artifactUrl: url,
    });
  }

  return { text, contentType, truncated };
}

export async function downloadExpertArtifact(
  input: ExpertArtifactDownloadInput,
): Promise<ExpertArtifactDownloadResult> {
  try {
    const url = resolveArtifactUrl(input);
    const res = await fetch(url, {
      method: "GET",
      headers: buildAuthHeaders("*/*"),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}`,
        errorCode: "ARTIFACT_NOT_FOUND",
      };
    }

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const ext =
      contentType.includes("json")
        ? ".json"
        : contentType.includes("markdown")
          ? ".md"
          : contentType.includes("text")
            ? ".txt"
            : "";
    const baseName = safeFilename(input.artifactId ?? `artifact-${Date.now()}`);
    const savedPath = join(downloadsDir(), `${baseName}${ext}`);

    if (res.body) {
      await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(savedPath));
    } else {
      const buf = Buffer.from(await res.arrayBuffer());
      await import("fs/promises").then((fs) => fs.writeFile(savedPath, buf));
    }

    return { ok: true, savedPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      errorCode: err instanceof HermesExpertsError ? err.code : "ARTIFACT_DOWNLOAD_FAILED",
    };
  }
}
