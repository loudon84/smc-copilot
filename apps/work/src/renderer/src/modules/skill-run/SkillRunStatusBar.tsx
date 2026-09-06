import React, { useTransition } from "react";
import { Loader2, CheckCircle2, XCircle, StopCircle, RotateCcw } from "lucide-react";
import type { SkillRunProjection } from "../../../../shared/skill-run";
import { useTranslation } from "react-i18next";

interface SkillRunStatusBarProps {
  projection: SkillRunProjection;
  onCancel?: () => void;
}

export const SkillRunStatusBar: React.FC<SkillRunStatusBarProps> = ({
  projection,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [, startTransition] = useTransition();

  const isTerminal =
    projection.phase === "succeeded" ||
    projection.phase === "failed" ||
    projection.phase === "cancelled" ||
    projection.phase === "expired" ||
    projection.phase === "unauthorized";

  const showArtifactRetry =
    projection.phase === "succeeded" && projection.artifactDiscoveryError === true;

  const handleCancel = () => {
    startTransition(() => {
      onCancel?.();
    });
  };

  const handleRetryDiscovery = () => {
    startTransition(() => {
      void window.hermesAPI.skillRun.retryArtifactDiscovery({
        clientRequestId: projection.clientRequestId,
        sessionId: projection.sessionId,
      });
    });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 px-4 py-2 border rounded-lg bg-muted/40 text-sm my-2"
    >
      <div className="flex items-center gap-2 min-w-0">
        {!isTerminal ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
        ) : projection.phase === "succeeded" ? (
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate">
            {projection.toolName}: {projection.displayStage || projection.phase}
          </span>
          {projection.errorMessage && (
            <span className="text-xs text-destructive truncate">
              {projection.errorMessage}
            </span>
          )}
          {projection.artifactDiscoveryMessage && (
            <span className="text-xs text-destructive truncate">
              {projection.artifactDiscoveryMessage}
            </span>
          )}
        </div>
      </div>

      {showArtifactRetry ? (
        <button
          type="button"
          onClick={handleRetryDiscovery}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground shrink-0 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t("skillRun.artifactRetry", "Retry artifact discovery")}</span>
        </button>
      ) : !isTerminal && onCancel ? (
        <button
          type="button"
          onClick={handleCancel}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground shrink-0 transition-colors"
        >
          <StopCircle className="w-3.5 h-3.5" />
          <span>{t("skillRun.cancelSkillRun", "Cancel")}</span>
        </button>
      ) : null}
    </div>
  );
};
