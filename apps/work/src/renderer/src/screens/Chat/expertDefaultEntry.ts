import type { SkillRunFeatureMode } from "../../../../shared/skill-run";

/**
 * Composer Expert default-create entry is production-hidden unless
 * feature mode is expert-compat. Skill-run sessions never mount it.
 * A null mode (IPC failure / missing API) fail-closes to hidden.
 */
export function shouldMountExpertDefaultEntry(input: {
  isSkillRunMode: boolean;
  featureMode: SkillRunFeatureMode | null;
}): boolean {
  if (input.isSkillRunMode) return false;
  return input.featureMode === "expert-compat";
}

/**
 * New Chat submits may call expert.start only in expert-compat.
 * Leftover expertSelection in skill-first / local-only must not start
 * an Expert Task. Slash-first and Local Chat routing stay in Chat.tsx.
 */
export function shouldSubmitNewExpertStart(input: {
  featureMode: SkillRunFeatureMode | null;
  hasLeftoverExpertSelection: boolean;
}): boolean {
  if (input.featureMode !== "expert-compat") return false;
  return input.hasLeftoverExpertSelection;
}
