import { FC } from "react";
import type { SkillCatalogToolItem } from "../../../../shared/skill-run";
import { Wand, X } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import "./skill-run.css";

export interface SkillSelectionBarProps {
  selection: SkillCatalogToolItem;
  onClear: () => void;
}

export const SkillSelectionBar: FC<SkillSelectionBarProps> = ({
  selection,
  onClear,
}) => {
  const { t } = useI18n();
  const isPromptFirst = selection.invocationMode === "prompt-first";

  return (
    <div className="skill-selection-bar">
      <div className="skill-selection-bar-left">
        <Wand size={14} className="skill-selection-bar-icon" />
        <span className="skill-selection-bar-label">
          {t("skillRun.activeSkill") || "Active Skill"}:
        </span>
        <span className="skill-selection-bar-title">{selection.title}</span>
        <span className="skill-selection-bar-slug">({selection.toolName})</span>
        {!isPromptFirst && (
          <span className="skill-selection-bar-unavailable">
            {t("skillRun.skillUnavailable") ||
              "This skill cannot be executed in prompt-first mode."}
          </span>
        )}
      </div>
      <button
        type="button"
        className="skill-selection-clear-btn"
        onClick={onClear}
        title={t("skillRun.clearSelection") || "Change skill"}
        aria-label={t("skillRun.clearSelection") || "Change skill"}
      >
        <X size={14} />
      </button>
    </div>
  );
};
