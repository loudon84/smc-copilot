import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import type { ExpertTaskTimelineEntry } from "../../../../types/expert-task-stream";
import { ExpertTaskArtifactCard } from "./ExpertTaskArtifactCard";

const STATUS_LABEL = {
  accepted: "Accepted",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
} as const;

function StatusIcon({ status }: { status: ExpertTaskTimelineEntry["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} className="hermes-expert-task-status-icon is-completed" />;
    case "failed":
      return <XCircle size={14} className="hermes-expert-task-status-icon is-failed" />;
    case "running":
      return <Loader2 size={14} className="hermes-expert-task-status-icon is-running" />;
    default:
      return <CircleDashed size={14} className="hermes-expert-task-status-icon is-accepted" />;
  }
}

type Props = {
  entry: ExpertTaskTimelineEntry;
  onPreviewArtifact?: (artifact: {
    taskId: string;
    artifactId?: string;
    artifactUrl?: string;
    name: string;
    mimeType?: string;
  }) => void;
  onDownloadArtifact?: (artifact: {
    taskId: string;
    artifactId?: string;
    artifactUrl?: string;
    name: string;
    mimeType?: string;
  }) => void;
};

export function ExpertTaskTimelineBlock({ entry, onPreviewArtifact, onDownloadArtifact }: Props) {
  const progressEvents = entry.events.filter((e) => e.type === "task.progress");
  const completedEvent = entry.events.find((e) => e.type === "task.completed");
  const failedEvent = entry.events.find((e) => e.type === "task.failed");
  const artifactEvents = entry.events.filter((e) => e.type === "task.artifact.ready");

  return (
    <div className="hermes-expert-task-timeline" data-status={entry.status}>
      <div className="hermes-expert-task-timeline__header">
        <StatusIcon status={entry.status} />
        <div className="hermes-expert-task-timeline__title-wrap">
          <p className="hermes-expert-task-timeline__title">Expert task {STATUS_LABEL[entry.status]}</p>
          <p className="hermes-expert-task-timeline__meta">
            {entry.expertName ? `${entry.expertName}` : "Expert"}
            {entry.skillName ? ` · ${entry.skillName}` : ""}
            {entry.taskNo || entry.taskId ? ` · ${entry.taskNo ?? entry.taskId}` : ""}
          </p>
        </div>
      </div>

      {entry.status === "accepted" && entry.events.length === 0 ? (
        <p className="hermes-expert-task-timeline__line">Task accepted. Waiting for stream events…</p>
      ) : null}

      {entry.events.some((e) => e.type === "task.started") ? (
        <p className="hermes-expert-task-timeline__line">Expert task started</p>
      ) : null}

      {progressEvents.map((event, index) => (
        <p key={`${event.taskId}-progress-${index}`} className="hermes-expert-task-timeline__line">
          {event.stage ? `[${event.stage}] ` : ""}
          {event.message}
        </p>
      ))}

      {artifactEvents.map((event, index) => (
        <ExpertTaskArtifactCard
          key={`${event.taskId}-artifact-${index}`}
          artifactId={event.artifactId}
          artifactUrl={event.artifactUrl}
          name={event.name ?? event.artifactId ?? "Artifact"}
          mimeType={event.mimeType}
          onPreview={() =>
            onPreviewArtifact?.({
              taskId: event.taskId,
              artifactId: event.artifactId,
              artifactUrl: event.artifactUrl,
              name: event.name ?? event.artifactId ?? "Artifact",
              mimeType: event.mimeType,
            })
          }
          onDownload={() =>
            onDownloadArtifact?.({
              taskId: event.taskId,
              artifactId: event.artifactId,
              artifactUrl: event.artifactUrl,
              name: event.name ?? event.artifactId ?? "Artifact",
              mimeType: event.mimeType,
            })
          }
        />
      ))}

      {completedEvent ? (
        <p className="hermes-expert-task-timeline__line is-completed">
          {completedEvent.message ?? "Task completed"}
          {completedEvent.resultText ? `\n\n${completedEvent.resultText}` : ""}
        </p>
      ) : null}

      {failedEvent ? (
        <p className="hermes-expert-task-timeline__line is-failed">
          {failedEvent.errorCode ? `[${failedEvent.errorCode}] ` : ""}
          {failedEvent.error}
        </p>
      ) : null}
    </div>
  );
}
