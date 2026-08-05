import {
  buildExpertPromptHint,
  shouldBuildExpertPromptHint,
} from "@renderer/screens/Hermes/pages/Chat/utils/buildExpertPromptHint";
import type { WorkChatSelectedExpert } from "@renderer/screens/Hermes/types/work-chat";
import type { WorkChatSelectedSkill } from "@renderer/screens/Hermes/types/work-chat";
import type { WorkPermissionMode } from "@renderer/screens/Hermes/types/work-chat";

export type AiosWorkPromptInput = {
  userMessage: string;
  selectedExpert?: WorkChatSelectedExpert | null;
  selectedSkill?: WorkChatSelectedSkill | null;
  permissionMode?: WorkPermissionMode;
  mcpServerName?: string;
};

/**
 * Work-domain prompt adapter — keeps Expert/Skill hint logic out of Chat Core.
 */
export function composeWorkPrompt(input: AiosWorkPromptInput): string {
  const expertName = input.selectedExpert?.name;
  const skillName = input.selectedSkill?.name;
  if (
    !shouldBuildExpertPromptHint({
      expertName,
      skillName,
    })
  ) {
    return input.userMessage;
  }
  return buildExpertPromptHint({
    userMessage: input.userMessage,
    expertName: expertName || undefined,
    expertId: input.selectedExpert?.expertId || input.selectedExpert?.slug,
    skillName: skillName || undefined,
    permissionMode: input.permissionMode,
    mcpServerName: input.mcpServerName,
  });
}
