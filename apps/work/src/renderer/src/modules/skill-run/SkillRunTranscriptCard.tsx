import { useTransition } from "react";
import { useTranslation } from "react-i18next";
import type { SkillRunMessage } from "../../screens/Chat/types";
import { isSkillRunTerminalPhase } from "../../../../shared/skill-run";

interface SkillRunTranscriptCardProps {
  msg: SkillRunMessage;
  sessionId?: string | null;
  onPreviewFile?: (fileId: string) => void;
}

export function SkillRunTranscriptCard({
  msg,
  sessionId,
  onPreviewFile,
}: SkillRunTranscriptCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const [, startTransition] = useTransition();
  const terminal = isSkillRunTerminalPhase(msg.phase);
  const approval = [...msg.activities]
    .reverse()
    .find(
      (item) => item.kind === "approval.requested" && Boolean(item.approvalId),
    );
  const showDecision =
    msg.phase === "waiting-approval" && Boolean(approval?.approvalId);
  const resolvedSessionId = sessionId?.trim() || "";

  const handleCancel = (): void => {
    if (!resolvedSessionId) return;
    startTransition(() => {
      void window.hermesAPI.skillRun.cancel({
        clientRequestId: msg.clientRequestId,
        sessionId: resolvedSessionId,
      });
    });
  };

  const handleDecide = (decision: "allow" | "deny"): void => {
    if (!resolvedSessionId) return;
    startTransition(() => {
      void window.hermesAPI.skillRun.decideApproval({
        clientRequestId: msg.clientRequestId,
        sessionId: resolvedSessionId,
        decision,
      });
    });
  };

  return (
    <div
      className="skill-run-transcript-card"
      data-phase={msg.phase}
      aria-busy={msg.pending}
    >
      <div className="skill-run-transcript-card-header">
        <span className="skill-run-transcript-card-title">{msg.toolName}</span>
        <span className="skill-run-transcript-card-stage">
          {msg.displayStage}
        </span>
      </div>
      {msg.activities.map((item) => (
        <div
          key={item.eventId}
          className="skill-run-transcript-activity"
          data-kind={item.kind}
        >
          {item.kind === "reasoning.summary" && (
            <span>{item.summary || t("skillRun.activityReasoning")}</span>
          )}
          {item.kind === "tool.call" && (
            <span>
              {item.toolName} ({item.status || "started"})
            </span>
          )}
          {item.kind === "clarify.requested" && (
            <div className="skill-run-transcript-clarify" aria-readonly="true">
              <p>{item.question}</p>
              {item.options?.map((option) => (
                <span key={option} className="skill-run-transcript-option">
                  {option}
                </span>
              ))}
            </div>
          )}
          {item.kind === "approval.requested" && (
            <span>{item.summary || t("skillRun.activityApproval")}</span>
          )}
        </div>
      ))}
      {msg.resultText ? (
        <pre className="skill-run-transcript-result">{msg.resultText}</pre>
      ) : null}
      {msg.errorMessage ? (
        <p className="skill-run-transcript-error">{msg.errorMessage}</p>
      ) : null}
      {msg.auditComplete === false ? (
        <p className="skill-run-transcript-incomplete">
          {t("skillRun.transcriptIncomplete")}
        </p>
      ) : null}
      {showDecision ? (
        <div className="skill-run-transcript-actions">
          <button type="button" onClick={() => handleDecide("allow")}>
            {t("skillRun.approvalAllow")}
          </button>
          <button type="button" onClick={() => handleDecide("deny")}>
            {t("skillRun.approvalDeny")}
          </button>
        </div>
      ) : null}
      {!terminal && msg.pending ? (
        <button type="button" onClick={handleCancel}>
          {t("skillRun.cancelSkillRun")}
        </button>
      ) : null}
      {msg.artifactFileIds?.map((fileId) => (
        <button
          type="button"
          key={fileId}
          className="skill-run-transcript-artifact"
          onClick={() => onPreviewFile?.(fileId)}
        >
          {t("skillRun.resultReady")}
        </button>
      ))}
    </div>
  );
}
