import type { HermesPanelSkillOption } from "../panel/HermesPanelSkill";

/** 目录名（path 末段），用于 flat 布局 skills/<name>/SKILL.md */
function skillFolderBasename(skill: HermesPanelSkillOption): string {
  const path = skill.path?.trim();
  if (!path) return "";
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function matchSkillName(
  requiredSkillName: string,
  skill: HermesPanelSkillOption,
): boolean {
  const target = requiredSkillName.trim().toLowerCase();
  if (!target) return false;

  const name = skill.value.trim().toLowerCase();
  const categoryName = skill.category
    ? `${skill.category}/${skill.value}`.trim().toLowerCase()
    : name;
  const folder = skillFolderBasename(skill).toLowerCase();

  return (
    target === name ||
    target === categoryName ||
    (folder.length > 0 && target === folder)
  );
}
