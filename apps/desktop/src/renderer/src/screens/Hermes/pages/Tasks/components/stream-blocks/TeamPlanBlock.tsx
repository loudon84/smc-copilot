import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

export function TeamPlanBlock({ event }: { event: WorkTaskEvent }) {
  if (event.type !== "team.plan.created") return null;
  return (
    <div className="hermes-stream-block hermes-stream-block--plan">
      <div className="hermes-stream-block__title">{event.planTitle}</div>
      <ol className="hermes-stream-block__steps">
        {event.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {event.estimatedOutput ? (
        <p className="hermes-stream-block__meta">预计输出：{event.estimatedOutput}</p>
      ) : null}
    </div>
  );
}
