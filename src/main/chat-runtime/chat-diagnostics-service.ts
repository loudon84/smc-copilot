/**
 * v8.1.1 — Chat diagnostics assembly + Main process Save Dialog.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { writeFileSync } from "fs";
import { dialog } from "electron";
import type { ChatDiagnosticsExport } from "../../shared/chat-runtime/chat-runtime-trace";
import { getRuntimeStoreHealth, getRun, listRuntimeEvents, listTurnsForRun } from "./chat-runtime-store";
import { probeStoreHealth } from "./chat-runtime-transaction";

const DEFAULT_RETENTION = {
  completedMetadataDays: 30,
  errorMetadataDays: 90,
  resolvedInteractionDays: 30,
};

export type DiagnosticsRetentionConfig = typeof DEFAULT_RETENTION & {
  retainFullRequest?: boolean;
  runtimeRetentionDays?: number;
  diagnosticsIncludeMessagePreview?: boolean;
};

let retentionConfig: DiagnosticsRetentionConfig = { ...DEFAULT_RETENTION };

export function setDiagnosticsRetentionConfig(
  config: Partial<DiagnosticsRetentionConfig>,
): void {
  retentionConfig = { ...retentionConfig, ...config };
}

export function getDiagnosticsRetentionConfig(): DiagnosticsRetentionConfig {
  return { ...retentionConfig };
}

function collectFileIds(runId: string, profileId: string): string[] {
  const turns = listTurnsForRun(runId, profileId);
  const ids = new Set<string>();
  for (const turn of turns) {
    if (!turn.requestSnapshotJson) continue;
    try {
      const snap = JSON.parse(turn.requestSnapshotJson) as {
        attachments?: Array<{ id?: string }>;
        attachmentIds?: string[];
      };
      for (const a of snap.attachments || []) {
        if (a.id) ids.add(a.id);
      }
      for (const id of snap.attachmentIds || []) {
        if (id) ids.add(id);
      }
    } catch {
      /* ignore */
    }
  }
  return [...ids];
}

export function buildChatDiagnosticsExport(input: {
  runId: string;
}): ChatDiagnosticsExport | { ok: false; error: string } {
  const runId = input?.runId?.trim();
  if (!runId) return { ok: false, error: "runId required" };
  const run = getRun(runId);
  if (!run) return { ok: false, error: `No run ${runId}` };
  const events = listRuntimeEvents(runId, undefined, run.profileId);
  const turns = listTurnsForRun(runId, run.profileId);
  const health = getRuntimeStoreHealth(run.profileId);
  const probe = probeStoreHealth(run.profileId);

  return {
    exportedAt: Date.now(),
    runId,
    profileId: run.profileId,
    sessionId: run.sessionId,
    runtimeMetadata: {
      status: run.status,
      activeTurnId: run.activeTurnId,
      lastEventSequence: run.lastEventSequence,
      updatedAt: run.updatedAt,
      storeHealth: health,
      storeProbe: probe,
      retention: getDiagnosticsRetentionConfig(),
    },
    eventTimeline: events.map((e) => ({
      eventId: e.eventId,
      turnId: e.turnId,
      sequence: e.sequence,
      type: e.type,
      emittedAt: e.emittedAt,
    })),
    toolTimeline: events
      .filter((e) => e.type === "tool.event")
      .map((e) => {
        try {
          const payload = JSON.parse(e.payloadJson) as {
            event?: { callId?: string; name?: string; status?: string };
          };
          return {
            callId: payload.event?.callId || "",
            name: payload.event?.name || "",
            status: payload.event?.status || "",
            turnId: e.turnId,
          };
        } catch {
          return { callId: "", name: "", status: "", turnId: e.turnId };
        }
      }),
    errors: turns
      .filter((t) => t.errorCode || t.errorMessage)
      .map((t) => ({
        turnId: t.turnId,
        code: t.errorCode || "UNKNOWN",
        message: t.errorMessage || "",
      })),
    fileIds: collectFileIds(runId, run.profileId),
  };
}

export async function saveChatDiagnosticsWithDialog(input: {
  runId: string;
}): Promise<{ ok: true; path: string } | { ok: false; error: string; cancelled?: boolean }> {
  const payload = buildChatDiagnosticsExport(input);
  if ("ok" in payload && payload.ok === false) {
    return payload;
  }
  const result = await dialog.showSaveDialog({
    title: "Export Chat Diagnostics",
    defaultPath: `chat-diagnostics-${input.runId}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, error: "cancelled", cancelled: true };
  }
  writeFileSync(result.filePath, JSON.stringify(payload, null, 2), "utf-8");
  return { ok: true, path: result.filePath };
}

/** AES-256-GCM encrypt sensitive request snapshot fields. */
export function encryptRequestSnapshot(
  plaintext: string,
  secret: string,
): string {
  const key = scryptSync(secret, "chat-runtime-v811", 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptRequestSnapshot(
  blob: string,
  secret: string,
): string {
  const [ver, ivB64, tagB64, dataB64] = blob.split(":");
  if (ver !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted snapshot");
  }
  const key = scryptSync(secret, "chat-runtime-v811", 32);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function shouldRetainRecord(
  kind: "completed" | "error" | "resolved_interaction",
  timestampMs: number,
  now = Date.now(),
): boolean {
  const days =
    kind === "error"
      ? retentionConfig.errorMetadataDays
      : kind === "resolved_interaction"
        ? retentionConfig.resolvedInteractionDays
        : retentionConfig.completedMetadataDays;
  return now - timestampMs <= days * 24 * 60 * 60 * 1000;
}
