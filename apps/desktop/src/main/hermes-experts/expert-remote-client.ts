/**
 * Remote expert execution via nodeskclaw MCP Gateway (V7.2).
 * Reuses mcp-gateway-invoke-test + hermes-client-api — no local Profile install.
 */
import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { RemoteRunContext } from "../../shared/hermes-experts/hermes-experts-contract";
import {
  buildDefaultRemoteContext,
  buildExpertToolArguments,
  callExpertSkill,
  resolveDefaultExpertSkill,
} from "./expert-mcp-client";
import {
  getHermesTaskResult,
  previewHermesArtifact,
  downloadHermesArtifact,
} from "../mcp-skill-gateway-runtime/hermes-client-api";

export {
  buildDefaultRemoteContext,
  buildExpertToolArguments,
} from "./expert-mcp-client";

export type RemoteToolCallResult = {
  ok: boolean;
  /** @deprecated Expert Gateway v6 — synchronous path has no task_id */
  taskId?: string;
  contentText?: string;
  errorCode?: string;
  message?: string;
  approvalRequired?: boolean;
  approvalRequestId?: string;
  grantStatus?: string;
  rawResult?: unknown;
};

/**
 * @deprecated V7.2 Expert Gateway — use callExpertSkill via expert-mcp-client. Kept for legacy HermesTask paths.
 */
export async function callRemoteExpertTool(input: {
  toolName: string;
  expertSlug?: string;
  skillName?: string;
  prompt: string;
  context?: RemoteRunContext;
}): Promise<RemoteToolCallResult> {
  const slug = (input.expertSlug ?? input.toolName)?.trim();
  if (!slug) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: "slug is required" };
  }

  const skillName = input.skillName?.trim() ?? (await resolveDefaultExpertSkill(slug));
  if (!skillName) {
    return { ok: false, errorCode: "EXPERT_TOOL_NAME_REQUIRED", message: "skillName is required" };
  }

  const call = await callExpertSkill(slug, skillName, {
    prompt: input.prompt,
    context: input.context,
  });

  if (!call.ok) {
    return {
      ok: false,
      errorCode: call.errorCode,
      message: call.message,
      approvalRequired: call.approvalRequired,
    };
  }

  return { ok: true, contentText: call.contentText, rawResult: call };
}

export async function fetchRemoteTaskResult(taskId: string) {
  return getHermesTaskResult(taskId);
}

export { previewHermesArtifact, downloadHermesArtifact };

const IMPORT_INDEX_PATH = () => join(app.getPath("userData"), "hermes-experts-imported-artifacts.json");

export type LocalImportedArtifact = {
  artifactId: string;
  remoteTaskId: string;
  localPath: string;
  importedAt: string;
  sha256?: string;
};

function readImportIndex(): LocalImportedArtifact[] {
  const path = IMPORT_INDEX_PATH();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as LocalImportedArtifact[];
  } catch {
    return [];
  }
}

function writeImportIndex(entries: LocalImportedArtifact[]): void {
  const path = IMPORT_INDEX_PATH();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2), "utf-8");
}

export function listImportedArtifacts(): LocalImportedArtifact[] {
  return readImportIndex();
}

export async function importRemoteArtifact(input: {
  artifactId: string;
  taskId: string;
  targetDir?: string;
}): Promise<{ ok: boolean; localPath?: string; errorCode?: string; message?: string }> {
  const download = await downloadHermesArtifact(input.artifactId);
  if (!download.ok || !download.savedPath) {
    return {
      ok: false,
      errorCode: download.errorCode ?? "EXPERT_ARTIFACT_IMPORT_FAILED",
      message: download.error ?? "Download failed",
    };
  }

  const entry: LocalImportedArtifact = {
    artifactId: input.artifactId,
    remoteTaskId: input.taskId,
    localPath: download.savedPath,
    importedAt: new Date().toISOString(),
  };
  const index = readImportIndex();
  index.unshift(entry);
  writeImportIndex(index.slice(0, 200));

  return { ok: true, localPath: download.savedPath };
}

import type { HermesExpertRunStatus } from "../../shared/hermes-experts/hermes-experts-contract";

export function mapRemoteTaskStatus(status: string): HermesExpertRunStatus {
  const normalized = status.toLowerCase();
  if (normalized === "queued" || normalized === "pending") return "preparing";
  if (normalized === "running" || normalized === "in_progress") return "running";
  if (normalized === "waiting_approval") return "waiting_approval";
  if (normalized === "completed" || normalized === "succeeded" || normalized === "success") return "completed";
  if (normalized === "failed" || normalized === "error") return "failed";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "timeout") return "failed";
  return "running";
}

export async function syncRemoteRunFromTask(runId: string, taskId: string): Promise<void> {
  const result = await getHermesTaskResult(taskId);
  if (!result.ok || !result.data) return;

  const {
    insertRunEvent,
    insertArtifact,
    updateExpertRunStatus,
    getExpertRun,
  } = await import("./expert-runtime-db");
  const { emitExpertRuntimeEvent } = await import("./expert-run-events");

  const task = result.data.task;
  const mappedStatus = mapRemoteTaskStatus(task.status);

  if (result.data.timeline?.length) {
    const existing = getExpertRun(runId);
    const existingTypes = new Set((existing?.events ?? []).map((e) => e.eventType));
    for (const ev of result.data.timeline) {
      const eventType = String(ev.event_type ?? ev.eventType ?? "remote.event");
      if (existingTypes.has(eventType)) continue;
      insertRunEvent({
        runId,
        eventType,
        payload: ev as Record<string, unknown>,
      });
    }
  }

  if (result.data.result_summary) {
    insertArtifact({
      runId,
      title: "Task result",
      artifactType: "markdown",
      previewText: result.data.result_summary.slice(0, 4000),
      source: "remote_task_result",
    });
  }

  for (const art of result.data.artifacts ?? []) {
    insertArtifact({
      runId,
      title: art.title ?? art.file_name ?? art.id,
      artifactType: (art.artifact_type as "markdown") ?? "file",
      filePath: art.download_url ?? art.preview_url,
      mimeType: art.content_type,
      source: "server_artifact",
    });
  }

  updateExpertRunStatus(runId, mappedStatus, {
    resultSummary: result.data.result_summary?.slice(0, 500),
  });

  emitExpertRuntimeEvent({
    type: "run_updated",
    runId,
    payload: { status: mappedStatus, taskId },
  });

  if (mappedStatus === "completed" || mappedStatus === "failed") {
    const { reportExpertRunIfConfigured } = await import("./expert-desktop-client");
    void reportExpertRunIfConfigured(runId);
  }
}
