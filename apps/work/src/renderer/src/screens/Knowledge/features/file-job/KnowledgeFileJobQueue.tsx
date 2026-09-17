import { type ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
      <p data-testid="knowledge-upload-queue-empty" className="text-xs text-muted-foreground">
        {props.emptyLabel}
      </p>
    );
  }
  return (
    <ul className="grid gap-3" data-testid="knowledge-upload-queue">
      {props.jobs.map((job) => (
        <li
          key={job.jobId}
          className="grid gap-2 rounded-md border border-border bg-card p-3 text-card-foreground"
          data-testid={`knowledge-upload-job-${job.jobId}`}
          data-status={job.status}
        >
          <div className="flex items-center justify-between gap-2">
            <strong className="truncate text-sm">
              {job.fileSummary?.displayName ?? job.jobId}
            </strong>
            <Badge>{job.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {props.progressLabel}: {job.progress}%
          </p>
          <Progress value={Math.max(0, Math.min(100, job.progress))} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid={`knowledge-upload-cancel-${job.jobId}`}
              onClick={() => props.onCancel(job.jobId)}
            >
              {props.cancelLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid={`knowledge-upload-retry-${job.jobId}`}
              onClick={() => props.onRetry(job.jobId)}
            >
              {props.retryLabel}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
