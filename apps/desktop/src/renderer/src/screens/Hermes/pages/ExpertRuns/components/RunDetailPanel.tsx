import { useTranslation } from "react-i18next";
import { canCancelRun, canRetryRun } from "../../../features/expert-run/runStatus";
import type { WorkRunDetail } from "../../../model/run";
import { ExpertRunMemberPanel } from "./ExpertRunMemberPanel";
import { RunArtifacts } from "./RunArtifacts";
import { RunErrorPanel } from "./RunErrorPanel";
import { RunResult } from "./RunResult";
import { RunTimeline } from "./RunTimeline";

type Props = {
  run: WorkRunDetail | null;
  loading?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
};

export function RunDetailPanel({ run, loading, onCancel, onRetry }: Props) {
  const { t } = useTranslation();

  if (!run) {
    return <p className="hermes-muted">{t("workspaces.hermes.expertRuns.selectRun")}</p>;
  }

  if (loading && !run.responseText) {
    return <p className="hermes-page__loading">{t("workspaces.hermes.common.loading")}</p>;
  }

  const showCancel = canCancelRun(run.status) && onCancel;
  const showRetry = canRetryRun(run.status) && onRetry;

  return (
    <div className="hermes-run-detail">
      <header>
        <h3>{run.title}</h3>
        <span className={`hermes-badge hermes-badge--${run.status}`}>{run.status}</span>
      </header>
      {run.remoteTaskId ? (
        <p className="hermes-muted">
          {t("workspaces.hermes.expertRuns.taskId", { defaultValue: "Task" })}: {run.remoteTaskId}
        </p>
      ) : null}
      {run.catalogSlug ? (
        <p className="hermes-muted">
          {t("workspaces.hermes.experts.expertSlug", { defaultValue: "Slug" })}: {run.catalogSlug}
        </p>
      ) : null}
      {run.skillName ? (
        <p className="hermes-muted">
          {t("workspaces.hermes.experts.skillName", { defaultValue: "Skill" })}: {run.skillName}
        </p>
      ) : null}
      {run.catalogKind === "expert_team" ? (
        <p className="hermes-badge">
          {t("workspaces.hermes.expertRuns.teamResult", { defaultValue: "Team result" })}
        </p>
      ) : null}
      {run.invocationId ? (
        <p className="hermes-muted">
          {t("workspaces.hermes.expertRuns.invocationId", { defaultValue: "Invocation" })}:{" "}
          {run.invocationId}
        </p>
      ) : null}
      <div className="hermes-run-detail__actions">
        {showCancel ? (
          <button type="button" className="hermes-btn-ghost" onClick={onCancel}>
            {t("workspaces.hermes.expertRuns.cancel")}
          </button>
        ) : null}
        {showRetry ? (
          <button type="button" className="hermes-btn-primary" onClick={onRetry}>
            {t("workspaces.hermes.expertRuns.retry")}
          </button>
        ) : null}
      </div>
      <p className="hermes-muted">{run.prompt}</p>
      {run.responseText ? <RunResult responseText={run.responseText} /> : null}
      {run.mode === "expert_team" || run.memberRuns.length > 0 ? (
        <ExpertRunMemberPanel memberRuns={run.memberRuns} teamEvents={run.timeline} />
      ) : null}
      <section>
        <h4>{t("workspaces.hermes.expertRuns.timeline")}</h4>
        <RunTimeline events={run.timeline} />
      </section>
      <RunArtifacts artifacts={run.artifacts} remoteTaskId={run.remoteTaskId} />
      {run.error ? <RunErrorPanel error={run.error} /> : null}
    </div>
  );
}
