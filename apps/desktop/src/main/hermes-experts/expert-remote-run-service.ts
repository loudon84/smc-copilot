import type {
  ExpertRunEvent,
  ImportArtifactInput,
  RemoteArtifact,
  RemoteRunResult,
} from "../../shared/hermes-experts/hermes-experts-contract";
import {
  fetchRemoteTaskResult,
  importRemoteArtifact,
  previewHermesArtifact,
  downloadHermesArtifact,
  syncRemoteRunFromTask,
  mapRemoteTaskStatus,
} from "./expert-remote-client";
import { getExpertRun, getArtifactById, listRunEvents } from "./expert-runtime-db";

export async function getRemoteRunResult(runId: string): Promise<RemoteRunResult | null> {
  const run = getExpertRun(runId);
  if (!run?.remoteTaskId) return null;

  const result = await fetchRemoteTaskResult(run.remoteTaskId);
  if (!result.ok || !result.data) return null;

  const artifacts: RemoteArtifact[] = (result.data.artifacts ?? []).map((a) => ({
    artifactId: a.id,
    taskId: run.remoteTaskId!,
    name: a.file_name ?? a.title ?? a.id,
    type: (a.artifact_type as RemoteArtifact["type"]) ?? "file",
    mimeType: a.content_type,
    source: "server_artifact",
    previewUrl: a.preview_url,
    downloadUrl: a.download_url,
  }));

  const timeline: ExpertRunEvent[] = (result.data.timeline ?? []).map((ev, i) => ({
    id: String(ev.id ?? `tl-${i}`),
    runId,
    eventType: String(ev.event_type ?? ev.eventType ?? "remote.event"),
    payload: ev as Record<string, unknown>,
    createdAt: String(ev.created_at ?? ev.createdAt ?? new Date().toISOString()),
  }));

  return {
    taskId: run.remoteTaskId,
    status: result.data.task.status,
    resultSummary: result.data.result_summary,
    artifacts,
    timeline,
  };
}

export async function getRemoteRunTimeline(runId: string): Promise<ExpertRunEvent[]> {
  const remote = await getRemoteRunResult(runId);
  if (remote?.timeline.length) return remote.timeline;
  return listRunEvents(runId);
}

function mapArtifactType(type: string | undefined): RemoteArtifact["type"] {
  const allowed: RemoteArtifact["type"][] = ["markdown", "file", "json", "txt", "csv", "docx", "pdf"];
  if (type && allowed.includes(type as RemoteArtifact["type"])) {
    return type as RemoteArtifact["type"];
  }
  return "file";
}

export async function listRemoteRunArtifacts(runId: string): Promise<RemoteArtifact[]> {
  const run = getExpertRun(runId);
  const local = (run?.artifacts ?? []).map((a) => ({
    artifactId: a.id,
    taskId: run?.remoteTaskId ?? run?.runId ?? "",
    name: a.title,
    type: mapArtifactType(a.artifactType),
    mimeType: a.mimeType,
    source: (a.source === "expert_mcp_response" ? "materialized" : "server_artifact") as RemoteArtifact["source"],
  }));
  if (local.length > 0) return local;

  const remote = await getRemoteRunResult(runId);
  if (remote?.artifacts.length) return remote.artifacts;
  return local;
}

export async function syncRunFromRemote(runId: string): Promise<void> {
  const run = getExpertRun(runId);
  if (!run?.remoteTaskId) return;
  await syncRemoteRunFromTask(runId, run.remoteTaskId);
}

export async function previewRunArtifact(artifactId: string) {
  const local = getArtifactById(artifactId);
  if (local?.previewText) {
    return { ok: true as const, text: local.previewText, contentType: local.mimeType ?? "text/plain" };
  }
  return previewHermesArtifact(artifactId);
}

export async function downloadRunArtifact(artifactId: string) {
  return downloadHermesArtifact(artifactId);
}

export async function importRunArtifact(input: ImportArtifactInput) {
  return importRemoteArtifact(input);
}

export function mapTaskStatusForUi(status: string): string {
  return mapRemoteTaskStatus(status);
}
