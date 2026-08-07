import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

export function TeamCreatedBlock({ event }: { event: WorkTaskEvent }) {
  if (event.type !== "team.created") return null;
  return (
    <div className="hermes-stream-block hermes-stream-block--team">
      <div className="hermes-stream-block__title">团队已创建：{event.teamName}</div>
      {event.taskGoal ? <p className="hermes-stream-block__meta">{event.taskGoal}</p> : null}
      {event.members?.length ? (
        <div className="hermes-stream-block__chips">
          {event.members.map((m) => (
            <span key={m.id} className="hermes-task-chip">
              {m.name}
              {m.role ? ` · ${m.role}` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
