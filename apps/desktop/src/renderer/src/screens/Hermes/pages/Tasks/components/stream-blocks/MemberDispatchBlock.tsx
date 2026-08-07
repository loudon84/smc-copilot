import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

export function MemberDispatchBlock({ event }: { event: WorkTaskEvent }) {
  if (event.type !== "team.member.assigned") return null;
  return (
    <div className="hermes-stream-block hermes-stream-block--dispatch">
      <span className="hermes-stream-block__label">分派</span>
      <strong>{event.memberName}</strong>
      {event.subTaskTitle ? <span> — {event.subTaskTitle}</span> : null}
    </div>
  );
}
