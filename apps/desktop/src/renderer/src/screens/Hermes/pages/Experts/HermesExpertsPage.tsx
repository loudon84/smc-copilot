import { useState } from "react";
import { Cloud, Info, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useExpertCatalog } from "../../features/expert-catalog/useExpertCatalog";
import { useExpertDetail } from "../../features/expert-catalog/useExpertDetail";
import { canSummonExpert } from "../../features/expert-call/canSummon";
import { useNavigateToRun } from "../../features/expert-call/useNavigateToRun";
import type { WorkExpert } from "../../model/expert";
import { FEATURED_SCENARIOS } from "./mock/expert-mock-data";
import { ExpertCard } from "./components/ExpertCard";
import { ExpertDetailDrawer } from "./components/ExpertDetailDrawer";
import { ExpertFilterBar } from "./components/ExpertFilterBar";
import { ExpertGrid } from "./components/ExpertGrid";
import { ExpertSummonDrawer, type ExpertSummonTarget } from "./components/ExpertSummonDrawer";

export default function HermesExpertsPage() {
  const { t } = useTranslation();
  const navigateToRun = useNavigateToRun();
  const {
    experts,
    catalogSource,
    loading,
    error,
    diagnostics,
    desktopSyncRegistered,
    category,
    setCategory,
    keyword,
    setKeyword,
    refresh,
    clearCache,
  } = useExpertCatalog();

  const [selected, setSelected] = useState<WorkExpert | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<ExpertSummonTarget | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  const { skills: detailSkills } = useExpertDetail(
    selected?.slug,
    drawerOpen,
  );

  const openCall = (expert: WorkExpert) => {
    setCallTarget({
      slug: expert.slug,
      kind: "expert",
      displayName: expert.displayName,
      callableSkillCount: expert.skillCount,
      starterPrompt: expert.starterPrompts[0]?.prompt,
    });
    setCallOpen(true);
  };

  const handleClearCache = async () => {
    await clearCache();
    setCacheNotice(t("workspaces.hermes.experts.catalogCacheCleared"));
  };

  return (
    <div className="hermes-page hermes-experts-page">
      <header className="hermes-page__header">
        <div>
          <h2>{t("workspaces.nav.experts")}</h2>
          <p className="hermes-page__subtitle">{t("workspaces.hermes.experts.subtitle")}</p>
        </div>
        <div className="hermes-page__header-actions">
          <span
            className={`hermes-connection-pill${catalogSource === "legacy_rest_fallback" ? " hermes-connection-pill--warn" : ""}`}
            title={
              diagnostics
                ? `${t("workspaces.hermes.experts.diagnosticsTitle")}: ${diagnostics.expertMcpRootUrl}\n${t(`workspaces.hermes.experts.source.${catalogSource}`, { defaultValue: catalogSource })}`
                : catalogSource
            }
          >
            {catalogSource === "remote" ? <Wifi size={14} /> : <WifiOff size={14} />}
            {t(`workspaces.hermes.experts.source.${catalogSource}`, { defaultValue: catalogSource })}
          </span>
          {diagnostics?.expertMcpRootUrl ? (
            <span className="hermes-connection-pill" title={diagnostics.expertMcpRootUrl}>
              <Info size={14} />
              Expert MCP
            </span>
          ) : null}
          <span className="hermes-connection-pill">
            <Cloud size={14} />
            {desktopSyncRegistered
              ? t("workspaces.hermes.experts.desktopSync.registered")
              : t("workspaces.hermes.experts.desktopSync.offline")}
          </span>
          <button type="button" className="hermes-btn-ghost" onClick={() => void handleClearCache()} disabled={loading}>
            <Trash2 size={14} />
            {t("workspaces.hermes.experts.clearCatalogCache")}
          </button>
          <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "hermes-spin" : undefined} />
            {t("workspaces.hermes.common.refresh")}
          </button>
        </div>
      </header>

      <ExpertFilterBar
        keyword={keyword}
        category={category}
        onKeywordChange={setKeyword}
        onCategoryChange={setCategory}
      />

      <div className="hermes-featured-scenarios">
        {FEATURED_SCENARIOS.map((s) => (
          <span key={s.key} className="hermes-scenario-chip">
            {t(s.labelKey, { defaultValue: s.key })}
          </span>
        ))}
      </div>

      {cacheNotice ? <p className="hermes-muted">{cacheNotice}</p> : null}

      {catalogSource === "remote" && experts.length === 0 && !loading ? (
        <p className="hermes-page__empty">{t("workspaces.hermes.experts.catalogEmpty")}</p>
      ) : null}

      {error ? (
        <div className="hermes-page__error">
          <p>{error}</p>
          <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()}>
            {t("workspaces.hermes.chat.retry")}
          </button>
        </div>
      ) : null}

      {loading && experts.length === 0 ? (
        <p className="hermes-page__loading">{t("workspaces.hermes.common.loading")}</p>
      ) : null}

      {!loading && experts.length === 0 && catalogSource !== "remote" ? (
        <p className="hermes-page__empty">{t("workspaces.hermes.experts.empty")}</p>
      ) : experts.length > 0 ? (
        <ExpertGrid>
          {experts.map((expert) => (
            <ExpertCard
              key={expert.id}
              expert={expert}
              canSummon={canSummonExpert(expert)}
              onView={(item) => {
                setSelected(item);
                setDrawerOpen(true);
              }}
              onSummon={openCall}
            />
          ))}
        </ExpertGrid>
      ) : null}

      <ExpertDetailDrawer
        expert={selected}
        skills={detailSkills}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSummon={openCall}
      />
      <ExpertSummonDrawer
        target={callTarget}
        open={callOpen}
        onClose={() => setCallOpen(false)}
        onSuccess={(runId) => {
          setDrawerOpen(false);
          navigateToRun(runId);
        }}
      />
    </div>
  );
}
