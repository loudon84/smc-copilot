import { useMemo, useState } from "react";
import { useI18n } from "../../../components/useI18n";
import AgentMarkdown from "../../../components/AgentMarkdown";
import { useWorkspaces } from "../context/WorkspacesContext";
import { useProfileSkills } from "../hooks/useProfileSkills";

function isMarkdownSkill(path: string, content: string): boolean {
  if (path.toLowerCase().endsWith(".md")) return true;
  return /^#\s|^\*\*|^-\s/m.test(content.trim());
}

export function SkillsPanel(): React.JSX.Element {
  const { t } = useI18n();
  const { activeProfileId } = useWorkspaces();
  const [search, setSearch] = useState("");
  const { grouped, loading, error, selectedSkill, skillContent, selectSkill } =
    useProfileSkills(activeProfileId, search);

  const useMarkdownPreview = useMemo(
    () =>
      selectedSkill ? isMarkdownSkill(selectedSkill.path, skillContent) : false,
    [selectedSkill, skillContent],
  );

  if (!activeProfileId) {
    return (
      <p className="workspaces-panel-muted">
        {t("workspaces.noProfile", { defaultValue: "No profile selected" })}
      </p>
    );
  }

  return (
    <div className="workspaces-panel-root">
      <input
        className="workspaces-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("workspaces.skills.search", { defaultValue: "Search skills…" })}
      />
      {loading ? (
        <p className="workspaces-panel-muted">{t("common.loading")}</p>
      ) : error ? (
        <p className="workspaces-panel-error">{error}</p>
      ) : (
        <div className="workspaces-skills-list-wrap">
          <ul className="workspaces-skills-list">
            {Object.entries(grouped).map(([category, items]) => (
              <li key={category} className="workspaces-skills-category">
                <p className="workspaces-skills-category-title">{category}</p>
                {items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void selectSkill(s)}
                    className={`workspaces-skill-item ${
                      selectedSkill?.id === s.id ? "is-active" : ""
                    }`}
                  >
                    {s.name}
                    <span className="workspaces-skill-item-meta">({s.sourceType})</span>
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <div className="workspaces-skill-preview">
            {selectedSkill ? (
              useMarkdownPreview ? (
                <AgentMarkdown>{skillContent}</AgentMarkdown>
              ) : (
                <pre className="workspaces-panel-pre">{skillContent}</pre>
              )
            ) : (
              <p className="workspaces-panel-muted">
                {t("workspaces.skills.selectHint", { defaultValue: "Select a skill" })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
