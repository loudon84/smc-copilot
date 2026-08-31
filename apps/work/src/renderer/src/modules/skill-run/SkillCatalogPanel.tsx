import { useState, useEffect, useMemo, FC } from "react";
import {
  fetchSkillRunCatalog,
  getSkillRunCatalogState,
  subscribeSkillRunCatalog,
} from "./store";
import type { SkillCatalogToolItem } from "../../../../shared/skill-run";
import { Search, Wand, Refresh, Alert } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import "./skill-run.css";

export interface SkillCatalogPanelProps {
  onSelectSkill: (tool: SkillCatalogToolItem) => void;
}

export const SkillCatalogPanel: FC<SkillCatalogPanelProps> = ({
  onSelectSkill,
}) => {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState(getSkillRunCatalogState);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    void fetchSkillRunCatalog();
    return subscribeSkillRunCatalog(() => {
      setCatalog(getSkillRunCatalogState());
    });
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tool of catalog.tools) {
      if (tool.category) set.add(tool.category);
    }
    return ["all", ...Array.from(set)];
  }, [catalog.tools]);

  const filteredTools = useMemo(() => {
    return catalog.tools.filter((tool) => {
      if (selectedCategory !== "all" && tool.category !== selectedCategory) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        tool.title.toLowerCase().includes(q) ||
        tool.toolName.toLowerCase().includes(q) ||
        (tool.description && tool.description.toLowerCase().includes(q))
      );
    });
  }, [catalog.tools, query, selectedCategory]);

  return (
    <div className="skill-catalog-panel">
      <div className="skill-catalog-header">
        <div className="skill-catalog-title-row">
          <Wand size={18} className="skill-catalog-icon" />
          <h2 className="skill-catalog-title">
            {t("skillRun.catalogTitle") || "Skill Catalog"}
          </h2>
          <button
            className="skill-catalog-refresh-btn"
            type="button"
            onClick={() => void fetchSkillRunCatalog(true)}
            title={t("skillRun.refresh") || "Refresh"}
          >
            <Refresh size={14} />
          </button>
        </div>
        <p className="skill-catalog-subtitle">
          {t("skillRun.catalogSubtitle") ||
            "Select a registered skill to execute directly against the backend."}
        </p>

        <div className="skill-catalog-search-row">
          <div className="skill-catalog-search-input-wrap">
            <Search size={14} className="skill-catalog-search-icon" />
            <input
              type="text"
              className="skill-catalog-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                t("skillRun.searchPlaceholder") || "Search skills..."
              }
            />
          </div>
        </div>

        {categories.length > 1 && (
          <div className="skill-catalog-category-pills">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`skill-category-pill ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === "all" ? t("skillRun.categoryAll") || "All" : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="skill-catalog-body">
        {catalog.status === "loading" && (
          <div className="skill-catalog-state-msg">
            <span className="skill-catalog-loading-spinner" />
            <p>{t("skillRun.loading") || "Loading skill catalog..."}</p>
          </div>
        )}

        {catalog.status === "contract-unsupported" && (
          <div className="skill-catalog-state-msg warning">
            <Alert size={24} />
            <h3>{t("skillRun.contractUnsupported") || "Contract Unsupported"}</h3>
            <p>
              {catalog.reason ||
                t("skillRun.contractUnsupportedNotice") ||
                "Skill Run Consumer Contract lock is not available for Checkpoint A."}
            </p>
          </div>
        )}

        {catalog.status === "unauthorized" && (
          <div className="skill-catalog-state-msg error">
            <Alert size={24} />
            <h3>{t("skillRun.unauthorized") || "Unauthorized"}</h3>
            <p>{t("skillRun.unauthorizedNotice") || "Please login to access skills."}</p>
          </div>
        )}

        {catalog.status === "backend-unavailable" && (
          <div className="skill-catalog-state-msg error">
            <Alert size={24} />
            <h3>{t("skillRun.backendUnavailable") || "Backend Unavailable"}</h3>
            <p>{catalog.reason || t("skillRun.backendUnavailableNotice") || "Failed to reach backend."}</p>
          </div>
        )}

        {catalog.status === "ready" && filteredTools.length === 0 && (
          <div className="skill-catalog-state-msg empty">
            <p>{t("skillRun.noSkillsFound") || "No skills found."}</p>
          </div>
        )}

        {catalog.status === "ready" && filteredTools.length > 0 && (
          <div className="skill-catalog-grid">
            {filteredTools.map((tool) => {
              const isCallable = tool.callability === "callable";
              return (
                <button
                  key={tool.toolName}
                  type="button"
                  className={`skill-card ${isCallable ? "" : "disabled"}`}
                  disabled={!isCallable}
                  onClick={() => onSelectSkill(tool)}
                >
                  <div className="skill-card-top">
                    <span className="skill-card-title">{tool.title}</span>
                    {tool.category && (
                      <span className="skill-card-category-tag">{tool.category}</span>
                    )}
                  </div>
                  {tool.description && (
                    <p className="skill-card-desc">{tool.description}</p>
                  )}
                  <span className="skill-card-name-slug">{tool.toolName}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
