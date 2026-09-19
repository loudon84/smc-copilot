import { getDbConnection } from "./db";
import {
  createSessionScope,
  getSessionMetadataBySessionId,
  upsertKbSetSessionMetadata,
  type SessionMetadata,
} from "./session-metadata-store";

export type KbSetSessionBinding = {
  sessionId: string;
  profileId: string;
  knowledgeSetId: string;
  sessionKind: "kb-set";
  executionProvider: "hermes-chat";
};

function toBinding(meta: SessionMetadata): KbSetSessionBinding | null {
  if (meta.sessionKind !== "kb-set" || !meta.knowledgeSetId) return null;
  return {
    sessionId: meta.sessionId,
    profileId: meta.profileId,
    knowledgeSetId: meta.knowledgeSetId,
    sessionKind: "kb-set",
    executionProvider: "hermes-chat",
  };
}

export function getSessionKnowledgeContext(
  sessionId: string,
): KbSetSessionBinding | null {
  const db = getDbConnection(true);
  if (!db) return null;
  const meta = getSessionMetadataBySessionId(db, sessionId);
  return meta ? toBinding(meta) : null;
}

export function setSessionKnowledgeContext(input: {
  sessionId: string;
  profileId: string;
  knowledgeSetId: string;
  messageCount?: number;
}): { ok: true } {
  const sessionId = input.sessionId?.trim();
  const profileId = input.profileId?.trim() || "default";
  const knowledgeSetId = input.knowledgeSetId?.trim();
  if (!sessionId || !knowledgeSetId) {
    throw new Error("KNOWLEDGE_SET_REQUIRED");
  }
  const db = getDbConnection(false);
  if (!db) throw new Error("KNOWLEDGE_BINDING_PERSIST_FAILED");
  upsertKbSetSessionMetadata(
    db,
    {
      sessionScope: createSessionScope(`local|${profileId}`),
      profileId,
      sessionId,
    },
    knowledgeSetId,
    { messageCount: input.messageCount },
  );
  return { ok: true };
}
