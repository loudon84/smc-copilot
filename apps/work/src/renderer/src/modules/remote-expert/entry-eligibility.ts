import type { ChatExecutionMode } from "../../screens/Layout/chatRuns";

/** Original Chat eligibility for Remote Expert Entry (PRD §4.1 / REQ-UI-001). */
export function isRemoteExpertEntryVisible(input: {
  executionMode?: ChatExecutionMode | string;
  knowledgeRequired?: boolean;
}): boolean {
  const mode = input.executionMode ?? "local-chat";
  if (mode === "skill-run") return false;
  if (input.knowledgeRequired === true) return false;
  return true;
}
