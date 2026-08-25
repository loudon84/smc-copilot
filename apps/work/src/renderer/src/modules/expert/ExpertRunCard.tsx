import { useState, type JSX } from "react";
import type { ExpertRunProjection } from "../../../../shared/expert";
import {
  buildExpertTranscriptAssistantContent,
  createClientRequestId,
} from "../../../../shared/expert";
import { upsertExpertProjection } from "./store";

interface ExpertRunCardProps {
  projection: ExpertRunProjection;
  authGeneration: string;
  onCancel: (clientRequestId: string, taskId: string | null) => void;
  /** Register a live retry so Chat can mirror transcript bubbles. */
  onLiveTranscriptRequest?: (clientRequestId: string) => void;
}

/**
 * Compact pre-task status row (submit → waiting for task_id accept).
 * Once the gateway returns task_id, Chat swaps to transcript bubbles and
 * stops rendering this card.
 */
export function ExpertRunCard({
  projection,
  authGeneration,
  onCancel,
  onLiveTranscriptRequest,
}: ExpertRunCardProps): JSX.Element {
  const [retryError, setRetryError] = useState<string | null>(null);
  const failed =
    projection.phase === "failed" || projection.phase === "unauthorized";
  const canRetry = failed || projection.errorCode === "delivery-timeout";

  return (
    <div
      className="expert-run-card expert-run-card-compact"
      data-testid="expert-run-card"
      data-phase={projection.phase}
      role="status"
    >
      <span className="expert-run-card-status">
        {buildExpertTranscriptAssistantContent(projection)}
      </span>
      {projection.errorMessage ? (
        <span role="alert" className="expert-run-card-error">
          {projection.errorMessage}
        </span>
      ) : null}
      {retryError ? (
        <span role="alert" className="expert-run-card-error">
          {retryError}
        </span>
      ) : null}
      {!failed ? (
        <button
          type="button"
          onClick={() =>
            onCancel(projection.clientRequestId, projection.taskId)
          }
        >
          Cancel
        </button>
      ) : null}
      {canRetry ? (
        <button
          type="button"
          onClick={() => {
            setRetryError(null);
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
            onLiveTranscriptRequest?.(nextRequest.clientRequestId);
            void window.hermesAPI.expert
              .retry({
                previousClientRequestId: projection.clientRequestId,
                request: nextRequest,
              })
              .then(upsertExpertProjection)
              .catch((err) => {
                setRetryError(err instanceof Error ? err.message : String(err));
              });
          }}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
