import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

export function ErrorBlock({ event }: { event: WorkTaskEvent }) {
  if (event.type !== "error") return null;
  return (
    <div className="hermes-stream-block hermes-stream-block--error">
      <strong>{event.error.code}</strong>
      <p>{event.error.message}</p>
    </div>
  );
}
