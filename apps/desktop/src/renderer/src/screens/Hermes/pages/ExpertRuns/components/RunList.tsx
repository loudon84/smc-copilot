import { useTranslation } from "react-i18next";
import type { WorkRun } from "../../../model/run";

type Props = {
  runs: WorkRun[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
};

export function RunList({ runs, selectedRunId, onSelect }: Props) {
  const { t } = useTranslation();

  if (runs.length === 0) {
    return <p className="hermes-page__empty">{t("workspaces.hermes.expertRuns.empty")}</p>;
  }

  return (
    <ul className="hermes-run-list">
      {runs.map((run) => (
        <li key={run.id}>
          <button
            type="button"
            className={`hermes-run-list-item${selectedRunId === run.id ? " is-active" : ""}`}
            onClick={() => onSelect(run.id)}
          >
            <strong>{run.title}</strong>
            <span>{run.mode}</span>
            <span className={`hermes-badge hermes-badge--${run.status}`}>{run.status}</span>
            <time>{new Date(run.createdAt).toLocaleString()}</time>
          </button>
        </li>
      ))}
    </ul>
  );
}
