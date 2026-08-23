/**
 * Persist / rehydrate Expert restart projections via session continuation.
 */

import type { ExpertRequest, ExpertRunProjection } from "../../shared/expert";
import { isExpertTerminalPhase } from "../../shared/expert";
import type { DesktopSessionContinuationItem } from "../../shared/session-continuation";
import {
  getCachedAccessToken,
  readStoredSessionSync,
} from "../auth/token-store";
import { getDbConnection } from "../db";
import {
  normalizeContinuationItems,
  persistSessionContinuation,
} from "../session-continuation-store";
import { getExpertRunService } from "./expert-run-service";

function loadRawContinuationItems(
  sessionId: string,
): DesktopSessionContinuationItem[] {
  const db = getDbConnection();
  if (!db) return [];
  const row = db
    .prepare(
      `SELECT prefix_json FROM desktop_session_continuations WHERE session_id = ?`,
    )
    .get(sessionId) as { prefix_json: string } | undefined;
  if (!row?.prefix_json) return [];
  try {
    return normalizeContinuationItems(JSON.parse(row.prefix_json));
  } catch {
    return [];
  }
}

export function projectionToContinuationItem(
  projection: ExpertRunProjection,
  authGeneration: string,
): Extract<DesktopSessionContinuationItem, { kind: "expert-run" }> | null {
  if (!projection.taskId) return null;
  return {
    kind: "expert-run",
    schemaVersion: 1,
    taskId: projection.taskId,
    clientRequestId: projection.clientRequestId,
    expertSlug: projection.expertSlug,
    skillName: projection.skillName,
    promptSummary: projection.prompt.slice(0, 200),
    sessionId: projection.sessionId,
    profileId: projection.profileId,
    authGeneration,
    lastEventId: projection.lastEventId,
    phase: projection.phase,
    updatedAt: projection.updatedAt,
  };
}

export function upsertExpertContinuationProjection(
  projection: ExpertRunProjection,
  authGeneration: string,
): void {
  const item = projectionToContinuationItem(projection, authGeneration);
  if (!item) return;
  const current = loadRawContinuationItems(projection.sessionId);
  const withoutSame = current.filter(
    (entry) =>
      !(
        entry.kind === "expert-run" &&
        entry.clientRequestId === projection.clientRequestId
      ),
  );
  if (
    isExpertTerminalPhase(projection.phase) &&
    (projection.phase === "succeeded" ||
      projection.phase === "cancelled" ||
      projection.phase === "unauthorized")
  ) {
    persistSessionContinuation(projection.sessionId, withoutSame);
    return;
  }
  persistSessionContinuation(projection.sessionId, [...withoutSame, item]);
}

export async function rehydrateExpertContinuationsForSession(
  sessionId: string,
): Promise<ExpertRunProjection[]> {
  const token = getCachedAccessToken();
  const session = readStoredSessionSync();
  if (!token || !session?.user?.id) {
    return [];
  }
  const authGeneration = `user:${session.user.id}`;
  const items = loadRawContinuationItems(sessionId);
  const service = getExpertRunService();
  const out: ExpertRunProjection[] = [];
  const kept: DesktopSessionContinuationItem[] = [];

  for (const item of items) {
    if (item.kind !== "expert-run") {
      kept.push(item);
      continue;
    }
    if (item.authGeneration !== authGeneration || item.sessionId !== sessionId) {
      continue;
    }
    const request: ExpertRequest = {
      kind: "expert",
      expertSlug: item.expertSlug,
      skillName: item.skillName,
      prompt: item.promptSummary,
      attachmentRefs: [],
      sessionId: item.sessionId,
      profileId: item.profileId,
      clientRequestId: item.clientRequestId,
      authGeneration: item.authGeneration,
    };
    try {
      const projection = await service.rehydrate({
        request,
        taskId: item.taskId,
        lastEventId: item.lastEventId,
        phase: item.phase,
      });
      if (
        projection.phase === "unauthorized" ||
        projection.phase === "expired"
      ) {
        continue;
      }
      out.push(projection);
      const next = projectionToContinuationItem(projection, authGeneration);
      if (next) kept.push(next);
    } catch {
      /* drop unrecoverable */
    }
  }

  persistSessionContinuation(sessionId, kept);
  return out;
}
