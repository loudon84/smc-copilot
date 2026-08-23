import type { ExpertRunProjection } from "../../../../shared/expert";
import {
  createClientRequestId,
  isExpertTerminalPhase,
} from "../../../../shared/expert";
import { ExpertTimeline } from "./ExpertTimeline";
import { upsertExpertProjection } from "./store";

interface ExpertRunCardProps {
  projection: ExpertRunProjection;
  authGeneration: string;
  onCancel: (clientRequestId: string, taskId: string | null) => void;
}

export function ExpertRunCard({
  projection,
  authGeneration,
  onCancel,
}: ExpertRunCardProps) {
  const terminal = isExpertTerminalPhase(projection.phase);
  const canRetry =
    projection.phase === "failed" ||
    projection.phase === "expired" ||
    projection.errorCode === "delivery-timeout";

  return (
    <article
      className="expert-run-card"
      data-testid="expert-run-card"
      data-phase={projection.phase}
    >
      <header>
        <strong>
          {projection.expertSlug} / {projection.skillName}
        </strong>
        <span>{projection.phase}</span>
      </header>
      <ExpertTimeline projection={projection} />
      {projection.errorMessage ? (
        <p role="alert">{projection.errorMessage}</p>
      ) : null}
      {projection.resultSummary ? <p>{projection.resultSummary}</p> : null}
      {projection.resultContent ? (
        <pre className="expert-run-result">{projection.resultContent}</pre>
      ) : null}
      {projection.artifactIds.length > 0 ? (
        <ul className="expert-run-artifacts">
          {projection.artifactIds.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  void window.hermesAPI.expert
                    .downloadArtifact({
                      taskId: projection.taskId ?? "",
                      artifactId: id,
                      sessionId: projection.sessionId,
                      profileId: projection.profileId,
                    })
                    .catch((err) => {
                      console.warn("[expert] artifact download failed", err);
                    });
                }}
              >
                Download artifact {id}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <footer>
        {!terminal ? (
          <button
            type="button"
            onClick={() => onCancel(projection.clientRequestId, projection.taskId)}
          >
            Cancel
          </button>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            onClick={() => {
              const nextRequest = {
                kind: "expert" as const,
                expertSlug: projection.expertSlug,
                skillName: projection.skillName,
                prompt: projection.prompt,
                attachmentRefs: [] as string[],
                sessionId: projection.sessionId,
                profileId: projection.profileId,
                clientRequestId: createClientRequestId(),
                authGeneration,
              };
              void window.hermesAPI.expert
                .retry({
                  previousClientRequestId: projection.clientRequestId,
                  request: nextRequest,
                })
                .then(upsertExpertProjection)
                .catch((err) => {
                  console.warn("[expert] retry failed", err);
                });
            }}
          >
            Retry
          </button>
        ) : null}
      </footer>
    </article>
  );
}
