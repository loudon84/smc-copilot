import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

const STATUS_DOT: Record<string, string> = {
  running: "is-running",
  completed: "is-completed",
  failed: "is-failed",
  waiting: "is-waiting",
};

export function MemberProgressBlock({ event }: { event: WorkTaskEvent }) {
  if (
    event.type !== "team.member.started" &&
    event.type !== "team.member.delta" &&
    event.type !== "team.member.completed" &&
    event.type !== "team.member.failed"
  ) {
    return null;
  }
  const dot = STATUS_DOT[event.status ?? "running"] ?? "is-running";
  return (
    <div className="hermes-stream-block hermes-stream-block--member">
      <span className={`hermes-task-status-dot ${dot}`} />
      <div>
        <strong>{event.memberName}</strong>
        {event.subTaskTitle ? <span className="hermes-stream-block__meta"> — {event.subTaskTitle}</span> : null}
        {event.summary ? <p>{event.summary}</p> : null}
        {event.content ? <p className="hermes-stream-block__delta">{event.content}</p> : null}
      </div>
    </div>
  );
}
