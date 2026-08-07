export type ExpertCallValidation = { ok: true } | { ok: false; message: string };

export function validateExpertCallInput(input: {
  skillName: string;
  prompt: string;
}): ExpertCallValidation {
  if (!input.skillName.trim()) {
    return { ok: false, message: "Skill is required" };
  }
  if (!input.prompt.trim()) {
    return { ok: false, message: "Prompt is required" };
  }
  return { ok: true };
}
