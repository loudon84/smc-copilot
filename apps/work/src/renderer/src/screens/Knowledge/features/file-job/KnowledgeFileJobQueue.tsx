import { type ReactElement } from "react";
import type { KnowledgeJobSnapshot } from "../../../../../../shared/knowledge/knowledge-job-ipc";
import { StatusBadge } from "../../../../components/common/StatusBadge";
import { Button } from "../../../../components/ui/Button";
import { Card, CardHead, CardTitle } from "../../../../components/ui/Card";
import { Progress } from "../../../../components/ui/Progress";

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
        <Card
          key={job.jobId}
          as="li"
          data-testid={`knowledge-upload-job-${job.jobId}`}
          data-status={job.status}
        >
          <CardHead>
            <CardTitle>{job.fileSummary?.displayName ?? job.jobId}</CardTitle>
            <StatusBadge>{job.status}</StatusBadge>
          </CardHead>
          <p>
            {props.progressLabel}: {job.progress}%
          </p>
          <Progress value={job.progress} />
          <div className="knowledge-toolbar">
            <Button
              size="sm"
              data-testid={`knowledge-upload-cancel-${job.jobId}`}
              onClick={() => props.onCancel(job.jobId)}
            >
              {props.cancelLabel}
            </Button>
            <Button
              size="sm"
              data-testid={`knowledge-upload-retry-${job.jobId}`}
              onClick={() => props.onRetry(job.jobId)}
            >
              {props.retryLabel}
            </Button>
          </div>
        </Card>
      ))}
    </ul>
  );
}
