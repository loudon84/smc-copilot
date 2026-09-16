import { type ReactElement } from "react";
import type { KnowledgeJobSnapshot } from "../../../../../../shared/knowledge/knowledge-job-ipc";

export function KnowledgeFileJobQueue(props: {
  jobs: KnowledgeJobSnapshot[];
  emptyLabel: string;
  progressLabel: string;
  cancelLabel: string;
  retryLabel: string;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}): ReactElement {
  if (props.jobs.length === 0) {
    return (
      <p data-testid="knowledge-upload-queue-empty">{props.emptyLabel}</p>
    );
  }
  return (
    <ul className="knowledge-card-grid" data-testid="knowledge-upload-queue">
      {props.jobs.map((job) => (
        <li
          key={job.jobId}
          className="settings-card"
          data-testid={`knowledge-upload-job-${job.jobId}`}
          data-status={job.status}
        >
          <div className="settings-card-head">
            <strong>{job.fileSummary?.displayName ?? job.jobId}</strong>
            <span className="settings-card-badge">{job.status}</span>
          </div>
          <p>
            {props.progressLabel}: {job.progress}%
          </p>
          <div className="knowledge-upload-progress">
            <div
              className="knowledge-upload-progress-bar"
              style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
            />
          </div>
          <div className="knowledge-toolbar">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid={`knowledge-upload-cancel-${job.jobId}`}
              onClick={() => props.onCancel(job.jobId)}
            >
              {props.cancelLabel}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid={`knowledge-upload-retry-${job.jobId}`}
              onClick={() => props.onRetry(job.jobId)}
            >
              {props.retryLabel}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
