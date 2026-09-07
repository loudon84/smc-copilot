import { FC } from "react";
import type { SkillCatalogToolItem } from "../../../../shared/skill-run";
import { Wand, X } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import "./skill-run.css";

export interface SkillSelectionBarProps {
  selection: SkillCatalogToolItem;
  onClear: () => void;
  extraParameterValues?: Record<string, string>;
  onExtraParametersChange?: (values: Record<string, string>) => void;
}

export const SkillSelectionBar: FC<SkillSelectionBarProps> = ({
  selection,
  onClear,
  extraParameterValues = {},
  onExtraParametersChange,
}) => {
  const { t } = useI18n();
  const isCallable = selection.callability === "callable";
  const extraFields =
    selection.invocationMode === "limited-parameter-form"
      ? (selection.extraStringFields ?? [])
      : [];

  return (
    <div>
      <div className="skill-selection-bar">
        <div className="skill-selection-bar-left">
          <Wand size={14} className="skill-selection-bar-icon" />
          <span className="skill-selection-bar-label">
            {t("skillRun.activeSkill") || "Active Skill"}:
          </span>
          <span className="skill-selection-bar-title">{selection.title}</span>
          <span className="skill-selection-bar-slug">({selection.toolName})</span>
          {!isCallable && (
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
      {extraFields.length > 0 && (
        <div className="skill-catalog-search-row">
          {extraFields.map((field) => {
            const label = field.title || field.name;
            return (
              <label key={field.name} className="skill-catalog-search-input-wrap">
                <span className="skill-selection-bar-label">{label}</span>
                <input
                  className="skill-catalog-search-input"
                  type="text"
                  value={extraParameterValues[field.name] ?? ""}
                  onChange={(event) => {
                    onExtraParametersChange?.({
                      ...extraParameterValues,
                      [field.name]: event.target.value,
                    });
                  }}
                  placeholder={label}
                  aria-label={label}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
