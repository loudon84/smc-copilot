import type { WorkParticipant } from "../../../../../../../shared/work/work-participant-contract";
const STATUS_CLASS: Record<string, string> = {
  idle: "is-idle",
  thinking: "is-running",
  running: "is-running",
  waiting: "is-waiting",
  completed: "is-completed",
  failed: "is-failed",
};

type Props = {
  participants: WorkParticipant[];
};

export function ParticipantBar({ participants }: Props) {
  if (participants.length === 0) return null;
  return (
    <div className="hermes-participant-bar">
      {participants.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`hermes-task-chip hermes-participant-chip ${STATUS_CLASS[p.status] ?? ""}${p.type === "lead" ? " is-lead" : ""}`}
          title={p.currentAction ?? p.role}
        >
          <span className={`hermes-task-status-dot ${STATUS_CLASS[p.status] ?? ""}`} />
          {p.name}
          {p.type === "lead" ? " · 总控" : ""}
        </button>
      ))}
    </div>
  );
}
