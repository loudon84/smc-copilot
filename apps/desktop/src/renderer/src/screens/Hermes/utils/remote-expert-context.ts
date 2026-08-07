import type { RemoteRunContext } from "../../../../../shared/hermes-experts/hermes-experts-contract";
export {
  buildPageContextFromStorage,
  savePageContextForRemoteExpert,
} from "../features/context-bridge/buildPageContext";

export const REMOTE_EXPERT_CONTEXT_EVENT = "hermes:remote-expert-context";

/** WebOperator / screen bridge — inject into tools/call context (no route override). */
export function buildWebOperatorContext(input: {
  pageUrl?: string;
  screenSummary?: string;
  conversationId?: string;
}): RemoteRunContext {
  return {
    source: "copilot-desktop",
    page_url: input.pageUrl,
    screen_summary: input.screenSummary,
    conversation_id: input.conversationId,
  };
}
