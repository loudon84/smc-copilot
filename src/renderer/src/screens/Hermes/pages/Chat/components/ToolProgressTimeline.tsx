import type { HermesToolCall } from "../../../types";

export type ToolProgressEntry = HermesToolCall & {
  startedAt: string;
  completedAt?: string;
};

type Props = {
  entries: ToolProgressEntry[];
};

function statusLabel(status: ToolProgressEntry["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "error") return "Failed";
  if (status === "waiting_approval") return "Waiting approval";
  return "Running";
}

export function ToolProgressTimeline({ entries }: Props): React.JSX.Element | null {
  if (entries.length === 0) return null;

  return (
    <div className="hermes-tool-progress-timeline" aria-label="Tool progress timeline">
      {entries.map((entry) => (
        <div key={entry.id} className="hermes-tool-progress-timeline__item">
          <div className="hermes-tool-progress-timeline__header">
            <span className="hermes-tool-progress-timeline__name">{entry.name}</span>
            <span className="hermes-tool-progress-timeline__status">{statusLabel(entry.status)}</span>
          </div>
          {entry.resultPreview ? (
            <pre className="hermes-tool-progress-timeline__body">{entry.resultPreview}</pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}
