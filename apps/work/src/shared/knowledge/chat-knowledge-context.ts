/**
 * Work Chat Knowledge wire context — schema work.chat.knowledge-context/1.0
 * MUST NOT include JWT/token/set name. Pure compose for Hermes wire prompts.
 */

export const CHAT_KNOWLEDGE_CONTEXT_SCHEMA_ID = "work.chat.knowledge-context/1.0";

export interface ChatKnowledgeContextV1 {
  version: "1.0";
  knowledgeSetId: string;
}

export const KNOWLEDGE_SET_REQUIRED = "KNOWLEDGE_SET_REQUIRED";

export function isChatKnowledgeContextV1(
  value: unknown,
): value is ChatKnowledgeContextV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChatKnowledgeContextV1>;
  if (candidate.version !== "1.0") return false;
  if (typeof candidate.knowledgeSetId !== "string") return false;
  if (candidate.knowledgeSetId.trim().length === 0) return false;
  const keys = Object.keys(candidate);
  return keys.every((k) => k === "version" || k === "knowledgeSetId");
}

export function assertChatKnowledgeContextV1(
  value: unknown,
): ChatKnowledgeContextV1 {
  if (!isChatKnowledgeContextV1(value)) {
    throw new Error(KNOWLEDGE_SET_REQUIRED);
  }
  return {
    version: "1.0",
    knowledgeSetId: value.knowledgeSetId.trim(),
  };
}

/** Wire JSON block payload (snake_case for Hermes / tool routing). */
export function knowledgeWirePayload(context: ChatKnowledgeContextV1): {
  version: "1.0";
  knowledge_set_id: string;
  tool: "knowledge.retrieve";
  policy: {
    selected_set_fixed: true;
    retrieve_for_enterprise_knowledge: true;
    on_retrieval_failure: "report_failure_without_fabrication";
  };
} {
  const normalized = assertChatKnowledgeContextV1(context);
  return {
    version: "1.0",
    knowledge_set_id: normalized.knowledgeSetId,
    tool: "knowledge.retrieve",
    policy: {
      selected_set_fixed: true,
      retrieve_for_enterprise_knowledge: true,
      on_retrieval_failure: "report_failure_without_fabrication",
    },
  };
}

/**
 * Prepend Knowledge scope block to the Hermes wire prompt.
 * `context == null` → output === input (byte-identical for ordinary Chat).
 */
export function composeKnowledgeScopedPrompt(
  userOrPreparedPrompt: string,
  context: ChatKnowledgeContextV1 | null,
): string {
  if (context == null) {
    return userOrPreparedPrompt;
  }
  const payload = knowledgeWirePayload(context);
  const json = JSON.stringify(payload);
  return `<smc_knowledge_context>\n${json}\n</smc_knowledge_context>\n\n${userOrPreparedPrompt}`;
}

const KNOWLEDGE_WIRE_PREFIX_RE =
  /^<smc_knowledge_context>\s*\n?[\s\S]*?\n?<\/smc_knowledge_context>\s*\n*/;

/**
 * Strip Knowledge wire prefix for UI / Prompt Navigator / titles.
 * Wire remains on Hermes; users MUST NOT see the block (REQ-API-003).
 */
export function stripKnowledgeScopedPromptPrefix(content: string): string {
  if (!content || !content.includes("<smc_knowledge_context>")) {
    return content;
  }
  return content.replace(KNOWLEDGE_WIRE_PREFIX_RE, "");
}
