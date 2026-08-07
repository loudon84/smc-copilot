import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useHermesDefault } from "../../context/HermesDefaultContext";
import type { RunFilterKey } from "../../features/expert-run/runFilter";
import { useExpertRunDetail } from "../../features/expert-run/useExpertRunDetail";
import { useExpertRuns } from "../../features/expert-run/useExpertRuns";
import { RunDetailPanel } from "./components/RunDetailPanel";
import { RunFilterBar } from "./components/RunFilterBar";
import { RunList } from "./components/RunList";

export default function HermesExpertRunsPage() {
  const { t } = useTranslation();
  const { pendingExpertRunId, setPendingExpertRunId } = useHermesDefault();
  const [filter, setFilter] = useState<RunFilterKey>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { runs, loading, error, refresh } = useExpertRuns(filter);

  useEffect(() => {
    if (pendingExpertRunId) {
      setSelectedRunId(pendingExpertRunId);
      setPendingExpertRunId(null);
    }
  }, [pendingExpertRunId, setPendingExpertRunId]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedRunId && runs.some((r) => r.id === selectedRunId)) {
      return selectedRunId;
    }
    return runs[0]?.id ?? null;
  }, [runs, selectedRunId]);

  const { detail, loading: detailLoading, cancel, retry } = useExpertRunDetail(effectiveSelectedId);

  return (
    <div className="hermes-page hermes-expert-runs-page">
      <header className="hermes-page__header">
        <div>
          <h2>{t("workspaces.nav.expertRuns")}</h2>
          <p className="hermes-page__subtitle">{t("workspaces.hermes.expertRuns.subtitle")}</p>
        </div>
        <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "hermes-spin" : undefined} />
          {t("workspaces.hermes.common.refresh")}
        </button>
      </header>

      <RunFilterBar filter={filter} onFilterChange={setFilter} />

      {error ? (
        <div className="hermes-page__error">
          <p>{error}</p>
          <button type="button" className="hermes-btn-ghost" onClick={() => void refresh()}>
            {t("workspaces.hermes.chat.retry")}
          </button>
        </div>
      ) : null}

      {loading && runs.length === 0 ? (
        <p className="hermes-page__loading">{t("workspaces.hermes.common.loading")}</p>
      ) : null}

      {!loading && runs.length === 0 ? (
        <p className="hermes-page__empty">{t("workspaces.hermes.expertRuns.empty")}</p>
      ) : (
        <div className="hermes-run-layout">
          <RunList runs={runs} selectedRunId={effectiveSelectedId} onSelect={setSelectedRunId} />
          <RunDetailPanel
            run={detail}
            loading={detailLoading}
            onCancel={() => void cancel().then(() => void refresh())}
            onRetry={() => void retry().then(() => void refresh())}
          />
        </div>
      )}
    </div>
  );
}
