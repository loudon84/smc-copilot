import type { JSX } from "react";
import type {
  ExpertCatalogItem,
  ExpertSkillItem,
} from "../../../../shared/expert";

export interface ExpertSelection {
  expertSlug: string | null;
  skillName: string | null;
}

interface ExpertSelectorProps {
  disabled?: boolean;
  value: ExpertSelection;
  onChange: (value: ExpertSelection) => void;
  catalog: ExpertCatalogItem[];
  skills: ExpertSkillItem[];
  skillsLoading?: boolean;
}

function catalogLabel(item: ExpertCatalogItem): string {
  if (item.displayName && item.displayName.trim()) return item.displayName;
  if (item.name.trim()) return item.name;
  return item.slug;
}

function skillLabel(item: ExpertSkillItem): string {
  if (item.displayName && item.displayName.trim()) return item.displayName;
  return item.name;
}

/** Pure controlled Expert/Skill fields — no network. */
export function ExpertSelector({
  disabled,
  value,
  onChange,
  catalog,
  skills,
  skillsLoading = false,
}: ExpertSelectorProps): JSX.Element {
  return (
    <div className="expert-selector" data-testid="expert-selector">
      <select
        aria-label="Expert"
        disabled={disabled}
        value={value.expertSlug ?? ""}
        onChange={(e) => {
          const slug = e.target.value || null;
          onChange({ expertSlug: slug, skillName: null });
        }}
      >
        <option value="">Local Chat</option>
        {catalog.map((item) => (
          <option
            key={item.slug}
            value={item.slug}
            disabled={item.status !== "ready"}
          >
            {catalogLabel(item)}
          </option>
        ))}
      </select>
      <select
        aria-label="Skill"
        disabled={disabled || !value.expertSlug || skillsLoading}
        value={value.skillName ?? ""}
        onChange={(e) => {
          onChange({
            expertSlug: value.expertSlug,
            skillName: e.target.value || null,
          });
        }}
      >
        <option value="">
          {skillsLoading ? "Loading skills…" : "Select skill"}
        </option>
        {skills.map((skill) => (
          <option key={skill.name} value={skill.name}>
            {skillLabel(skill)}
          </option>
        ))}
      </select>
    </div>
  );
}
