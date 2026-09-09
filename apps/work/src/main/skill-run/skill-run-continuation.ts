/**
 * Persist / rehydrate Skill Run restart projections via session continuation.
 */

import type { SkillRunContinuationItem, SkillRunProjection } from "../../shared/skill-run";
import { isSkillRunTerminalPhase } from "../../shared/skill-run";
import type { DesktopSessionContinuationItem } from "../../shared/session-continuation";
import {
  getCachedAccessToken,
  readStoredSessionSync,
} from "../auth/token-store";
import {
  loadNormalizedContinuationItems,
  persistSessionContinuation,
} from "../session-continuation-store";
import { getSkillRunService } from "./skill-run-ipc";
import { listSkillRunTranscriptForSession } from "./skill-run-transcript-store";

function loadRawContinuationItems(
  sessionId: string,
): DesktopSessionContinuationItem[] {
  return loadNormalizedContinuationItems(sessionId);
}

export function projectionToSkillRunContinuationItem(
  projection: SkillRunProjection,
): SkillRunContinuationItem {
  return {
    kind: "skill-run",
    schemaVersion: 1,
    clientRequestId: projection.clientRequestId,
    providerRunId: projection.providerRunId,
    toolName: projection.toolName,
    promptSummary: projection.promptSummary.slice(0, 200),
    sessionId: projection.sessionId,
    profileId: projection.profileId,
    authGeneration: projection.authGeneration,
    lastEventId: projection.lastEventId,
    phase: projection.phase,
    text: projection.text,
    updatedAt: projection.updatedAt,
  };
}

export function upsertSkillRunContinuationProjection(
  projection: SkillRunProjection,
): void {
  try {
    const item = projectionToSkillRunContinuationItem(projection);
    const current = loadRawContinuationItems(projection.sessionId);
    const withoutSame = current.filter(
      (entry) =>
        !(
          entry.kind === "skill-run" &&
          entry.clientRequestId === projection.clientRequestId
        ),
    );

    if (
      isSkillRunTerminalPhase(projection.phase) &&
      (projection.phase === "succeeded" ||
        projection.phase === "cancelled" ||
        projection.phase === "unauthorized")
    ) {
      persistSessionContinuation(projection.sessionId, withoutSame);
      return;
    }

    persistSessionContinuation(projection.sessionId, [...withoutSame, item]);
  } catch (err) {
    console.warn("[skill-run] continuation upsert failed", err);
  }
}

export async function rehydrateSkillRunContinuationsForSession(
  sessionId: string,
): Promise<SkillRunProjection[]> {
  const token = getCachedAccessToken();
  const session = readStoredSessionSync();
  const currentAuthGeneration =
    token && session?.user?.id ? `user:${session.user.id}` : "";

  const items = loadRawContinuationItems(sessionId);
  const service = getSkillRunService();
  const out: SkillRunProjection[] = [];
  const kept: DesktopSessionContinuationItem[] = [];

  for (const entry of items) {
    if (entry.kind !== "skill-run") {
      kept.push(entry);
      continue;
    }

    // Drop expired auth generation if user logged in under a different identity
    if (
      entry.authGeneration &&
      currentAuthGeneration &&
      entry.authGeneration !== currentAuthGeneration
    ) {
      continue;
    }

    try {
      const proj = await service.rehydrate(entry);
      if (proj) {
        out.push(proj);
        if (!isSkillRunTerminalPhase(proj.phase)) {
          kept.push(entry);
        }
      }
    } catch {
      // drop broken entries
    }
  }

  try {
    const batch = listSkillRunTranscriptForSession(sessionId);
    const seen = new Set(out.map((projection) => projection.clientRequestId));
    for (const row of batch.runs) {
      if (
        seen.has(row.clientRequestId) ||
        row.sessionId !== sessionId ||
        row.phase !== "succeeded" ||
        !row.providerRunId ||
        row.errorCode !== "RESULT_RETRIEVAL_FAILED"
      ) {
        continue;
      }
      const projection = await service.rehydrate({
        clientRequestId: row.clientRequestId,
        providerRunId: row.providerRunId,
        toolName: row.toolName,
        promptSummary: row.prompt.slice(0, 200),
        sessionId: row.sessionId,
        profileId: row.profileId,
        lastEventId: row.lastEventId,
        phase: row.phase,
        text: row.text,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        updatedAt: row.updatedAt,
      });
      if (projection) {
        seen.add(projection.clientRequestId);
        out.push(projection);
      }
    }
  } catch {
    // A sidecar read must not prevent normal continuation restoration.
  }

  persistSessionContinuation(sessionId, kept);
  return out;
}
