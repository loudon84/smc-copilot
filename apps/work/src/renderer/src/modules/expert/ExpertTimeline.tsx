import type { ExpertRunProjection } from "../../../../shared/expert";
import { isExpertTerminalPhase } from "../../../../shared/expert";

/** Minimum-stage timeline only — never claim tool-level runtime progress. */
export function ExpertTimeline({
  projection,
}: {
  projection: ExpertRunProjection;
}) {
  const stages = ["preparing", "running", "finalizing"] as const;
  const current = projection.displayStage ?? "preparing";
  return (
    <ol className="expert-timeline" data-testid="expert-timeline">
      {stages.map((stage) => {
        const active = current === stage;
        return (
          <li
            key={stage}
            className={active ? "expert-timeline-active" : undefined}
            aria-current={active ? "step" : undefined}
          >
            {stage === "preparing"
              ? "Preparing"
              : stage === "running"
                ? "Running"
                : "Finalizing"}
          </li>
        );
      })}
      {isExpertTerminalPhase(projection.phase) ? (
        <li className="expert-timeline-terminal">{projection.phase}</li>
      ) : null}
    </ol>
  );
}
