import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useHermesDefault } from "../../context/HermesDefaultContext";

type SkillsTab = "installed" | "bundled";

type SkillSearchable = {
  name: string;
  description: string;
  category?: string;
};

function matchesSkillSearch(item: SkillSearchable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.description, item.category]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(q));
}

export default function HermesSkillsPage() {
  const { t } = useTranslation();
  const { skills } = useHermesDefault();
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SkillsTab>("installed");
  const [search, setSearch] = useState("");

  const filteredInstalled = useMemo(
    () => skills.installed.filter((s) => matchesSkillSearch(s, search)),
    [skills.installed, search],
  );

  const filteredBundled = useMemo(
    () => skills.bundled.filter((s) => matchesSkillSearch(s, search)),
    [skills.bundled, search],
  );

  const loadPreview = useCallback(
    async (name: string, path?: string) => {
      setSelectedName(name);
      const installed = skills.installed.find((s) => s.name === name);
      const skillPath = path ?? installed?.path;
      if (!skillPath) {
        setPreview(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const content = await skills.read(skillPath);
        setPreview(content || null);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [skills],
  );

  const activeList = activeTab === "installed" ? filteredInstalled : filteredBundled;
  const totalCount = activeTab === "installed" ? skills.installed.length : skills.bundled.length;

  return (
    <div className="hermes-page hermes-skills-page">
      <header className="hermes-page__header">
        <h2>{t("workspaces.nav.skills")}</h2>
        <button type="button" className="hermes-btn-ghost" onClick={() => void skills.refresh()}>
          {t("workspaces.hermes.common.refresh")}
        </button>
      </header>

      {skills.error ? <p className="hermes-page__error">{skills.error}</p> : null}

      <div className="hermes-skills-layout">
        <div className="hermes-skills-layout__lists">
          <nav className="hermes-skills-inner-tabs" aria-label="Skills sections">
            {(
              [
                ["installed", t("workspaces.hermes.skills.installed")],
                ["bundled", t("workspaces.hermes.skills.bundled")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`hermes-skills-inner-tabs__btn${activeTab === key ? " is-active" : ""}`}
                onClick={() => setActiveTab(key)}
              >
                {label}
                <span className="hermes-skills-inner-tabs__count">
                  {key === "installed" ? skills.installed.length : skills.bundled.length}
                </span>
              </button>
            ))}
          </nav>

          <div className="hermes-skills-tab__toolbar">
            <label className="hermes-skills-search">
              <Search size={14} aria-hidden />
              <input
                className="hermes-input hermes-skills-search__input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("workspaces.hermes.skills.search")}
                aria-label={t("workspaces.hermes.skills.search")}
              />
            </label>
          </div>

          {skills.loading ? (
            <p className="hermes-muted">{t("workspaces.hermes.common.loading")}</p>
          ) : activeList.length === 0 ? (
            <p className="hermes-muted">
              {search.trim() && totalCount > 0
                ? t("workspaces.hermes.skills.emptySearch")
                : activeTab === "installed"
                  ? t("workspaces.hermes.skills.emptyInstalled")
                  : t("workspaces.hermes.skills.emptyBundled")}
            </p>
          ) : (
            <ul className="hermes-skills-card-list">
              {activeTab === "installed"
                ? filteredInstalled.map((s) => (
                    <li key={s.name} className="hermes-skills-card">
                      <button
                        type="button"
                        className={`hermes-skills-card__main${selectedName === s.name ? " is-selected" : ""}`}
                        onClick={() => void loadPreview(s.name, s.path)}
                      >
                        <div className="hermes-skills-card__head">
                          <strong>{s.name}</strong>
                          {s.category ? (
                            <span className="hermes-skills-card__badge">{s.category}</span>
                          ) : null}
                        </div>
                        <p className="hermes-skills-card__desc">{s.description}</p>
                      </button>
                      <div className="hermes-skills-card__actions">
                        <button
                          type="button"
                          className="hermes-btn-ghost"
                          onClick={() => void skills.uninstall(s.name).then(() => skills.refresh())}
                        >
                          {t("workspaces.hermes.skills.uninstall")}
                        </button>
                      </div>
                    </li>
                  ))
                : filteredBundled.map((s) => (
                    <li key={s.name} className="hermes-skills-card">
                      <button
                        type="button"
                        className={`hermes-skills-card__main${selectedName === s.name ? " is-selected" : ""}`}
                        onClick={() => void loadPreview(s.name)}
                      >
                        <div className="hermes-skills-card__head">
                          <strong>{s.name}</strong>
                          {s.category ? (
                            <span className="hermes-skills-card__badge">{s.category}</span>
                          ) : null}
                        </div>
                        <p className="hermes-skills-card__desc">{s.description}</p>
                      </button>
                      <div className="hermes-skills-card__actions">
                        {!s.installed ? (
                          <button
                            type="button"
                            className="hermes-btn-primary"
                            onClick={() => void skills.install(s.name).then(() => skills.refresh())}
                          >
                            {t("workspaces.hermes.skills.install")}
                          </button>
                        ) : (
                          <span className="hermes-muted">{t("workspaces.hermes.skills.installedBadge")}</span>
                        )}
                      </div>
                    </li>
                  ))}
            </ul>
          )}
        </div>

        <aside className="hermes-skills-layout__preview">
          {previewLoading ? (
            <p className="hermes-muted">{t("workspaces.hermes.skills.previewLoading")}</p>
          ) : preview ? (
            <pre className="hermes-skill-preview">{preview}</pre>
          ) : selectedName ? (
            <p className="hermes-muted">{t("workspaces.hermes.skills.previewUnavailable")}</p>
          ) : (
            <p className="hermes-muted">{t("workspaces.hermes.skills.previewHint")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
