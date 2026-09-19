/**
 * G4 / REQ-API-003 — Legacy Knowledge send preflight (no Dashboard required).
 */
import type { KbSetSessionBinding } from "../session-knowledge-binding";

export type LegacyKnowledgeSendGuardResult =
  | { ok: true; mode: "first-create" | "subsequent"; bindingWritten: boolean }
  | { ok: false; error: string };

/**
 * Decide whether a Legacy Knowledge send may proceed.
 * - No resumeSessionId → first-create ALLOWED (kb-set written after session_id).
 * - With resumeSessionId → require existing kb-set row matching set id.
 */
export function guardLegacyKnowledgeSend(input: {
  knowledgeSetId: string;
  resumeSessionId?: string | null;
  binding: KbSetSessionBinding | null;
}): LegacyKnowledgeSendGuardResult {
  const knowledgeSetId = input.knowledgeSetId?.trim() || "";
  if (!knowledgeSetId) {
    return { ok: false, error: "KNOWLEDGE_SET_REQUIRED" };
  }
  const resumeSid = input.resumeSessionId?.trim() || "";
  if (!resumeSid) {
    return { ok: true, mode: "first-create", bindingWritten: false };
  }
  const binding = input.binding;
  if (!binding || binding.sessionKind !== "kb-set") {
    return {
      ok: false,
      error:
        "KNOWLEDGE_BINDING_NOT_FOUND: Legacy Knowledge send requires an existing kb-set row.",
    };
  }
  if (binding.knowledgeSetId !== knowledgeSetId) {
    return { ok: false, error: "KNOWLEDGE_SESSION_SCOPE_CONFLICT" };
  }
  return { ok: true, mode: "subsequent", bindingWritten: true };
}

/** True only when Main may INSERT/upsert a new kb-set row for this send. */
export function isLegacyKnowledgeFirstCreate(
  knowledgeSetId: string | null | undefined,
  resumeSessionId: string | null | undefined,
): boolean {
  return Boolean(knowledgeSetId?.trim() && !resumeSessionId?.trim());
}
