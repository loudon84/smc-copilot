/**
 * v8.1.1 — Restore Expert/Team/Work context for Edit-and-Retry.
 */

import type {
  ChatRunContextPort,
  ChatRunContextSnapshot,
} from "../../../../modules/chat/ports/ChatRunContextPort";

export type AiosChatRunContextAdapters = {
  getExpertId?: () => string | undefined;
  getTeamId?: () => string | undefined;
  getSkillName?: () => string | undefined;
  getWorkMode?: () => string | undefined;
  getPermissionMode?: () => string | undefined;
  getPromptHintMode?: () => "auto" | "custom" | "disabled" | undefined;
  getModelId?: () => string | null | undefined;
  setExpertId?: (id: string | undefined) => void;
  setTeamId?: (id: string | undefined) => void;
  setSkillName?: (name: string | undefined) => void;
  setWorkMode?: (mode: string | undefined) => void;
  setPermissionMode?: (mode: string | undefined) => void;
  setPromptHintMode?: (mode: "auto" | "custom" | "disabled" | undefined) => void;
  setModelId?: (id: string | null | undefined) => void;
};

export function createAiosChatRunContextAdapter(
  hooks: AiosChatRunContextAdapters,
): ChatRunContextPort {
  return {
    getContext(_runId: string): ChatRunContextSnapshot {
      return {
        expertId: hooks.getExpertId?.(),
        teamId: hooks.getTeamId?.(),
        skillName: hooks.getSkillName?.(),
        workMode: hooks.getWorkMode?.(),
        permissionMode: hooks.getPermissionMode?.(),
        promptHintMode: hooks.getPromptHintMode?.(),
        modelId: hooks.getModelId?.() ?? null,
      };
    },
    async restoreContext(
      _runId: string,
      context: ChatRunContextSnapshot,
    ): Promise<void> {
      hooks.setExpertId?.(context.expertId);
      hooks.setTeamId?.(context.teamId);
      hooks.setSkillName?.(context.skillName);
      hooks.setWorkMode?.(context.workMode);
      hooks.setPermissionMode?.(context.permissionMode);
      hooks.setPromptHintMode?.(context.promptHintMode);
      if (context.modelId !== undefined) {
        hooks.setModelId?.(context.modelId);
      }
    },
  };
}
