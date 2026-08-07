import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkRun } from "../../../model/run";

type Props = {
  runs: WorkRun[];
  onOpenRun: (runId: string) => void;
  onViewAll: () => void;
};

export function RecentRuns({ runs, onOpenRun, onViewAll }: Props) {
  const { t } = useTranslation();

  return (
    <article className="hermes-workbench-card">
      <h3>
        <Activity size={16} /> {t("workspaces.hermes.workbench.recentRuns")}
      </h3>
      <ul className="hermes-workbench-list">
        {runs.map((run) => (
          <li key={run.id}>
            <button type="button" className="hermes-link-button" onClick={() => onOpenRun(run.id)}>
              {run.title} — {run.status}
            </button>
          </li>
        ))}
        {runs.length === 0 ? (
          <li className="hermes-muted">{t("workspaces.hermes.expertRuns.empty")}</li>
        ) : null}
      </ul>
      {runs.length > 0 ? (
        <div className="hermes-workbench-actions">
          <button type="button" className="hermes-btn-ghost" onClick={onViewAll}>
            {t("workspaces.hermes.workbench.viewAllRuns")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
