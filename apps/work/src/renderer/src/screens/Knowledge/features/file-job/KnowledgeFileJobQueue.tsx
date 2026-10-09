import { type ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useI18n } from "../../../../components/useI18n";
import { formatFileSize } from "../../../../components/files/composer/file-card-utils";
import type { KnowledgeJobSnapshot } from "../../../../../../shared/knowledge/knowledge-job-ipc";

export function knowledgeUploadErrorKey(
  code: string,
  status?: KnowledgeJobSnapshot["status"],
): string {
  if (["INTERRUPTED", "KNOWLEDGE_JOB_RECEIPT_UNCONFIRMED"].includes(code)) {
    if (status === "awaiting_confirmation") return "remoteResultUnknown";
    if (status === "interrupted") return "localImportInterrupted";
  }
  if (code === "INGESTION_FAILED") return "ingestionFailed";
  if (
    [
      "AUTH_REQUIRED",
      "KNOWLEDGE_AUTH_REQUIRED",
      "KNOWLEDGE_JOB_AUTH_REQUIRED",
    ].includes(code)
  )
    return "authError";
  if (["PARTITION_DENIED", "KNOWLEDGE_JOB_PARTITION_DENIED"].includes(code))
    return "identityChanged";
  if (
    [
      "PROVIDER_UNAVAILABLE",
      "KNOWLEDGE_UNAVAILABLE",
      "KNOWLEDGE_TIMEOUT",
      "KNOWLEDGE_JOB_PROVIDER_UNAVAILABLE",
      "KNOWLEDGE_PROVIDER_UNAVAILABLE",
    ].includes(code)
  )
    return "serviceError";
  if (["CONTRACT_INVALID", "KNOWLEDGE_CONTRACT_INVALID"].includes(code))
    return "contractError";
  if (code === "KNOWLEDGE_UPLOAD_BRIDGE_UNAVAILABLE")
    return "pickerRequiresRestart";
  if (
    ["KNOWLEDGE_JOB_DELETE_CONFLICT", "KNOWLEDGE_JOB_NOT_FOUND"].includes(code)
  )
    return "deleteConflict";
  if (
    [
      "KNOWLEDGE_JOB_STORE_UNAVAILABLE",
      "KNOWLEDGE_JOB_STORE_MIGRATION_READ_ONLY",
    ].includes(code)
  )
    return "deleteError";
  if (code === "FILE_CONTENT_ENCRYPTED_OR_INVALID") return "contentUnreadable";
  if (code === "FILE_UPLOAD_CONTENT_UNREADABLE")
    return "uploadContentUnreadable";
  if (code === "FILE_TOO_LARGE") return "fileTooLarge";
  if (
    [
      "FILE_NOT_FOUND",
      "FILE_READ_FAILED",
      "KNOWLEDGE_JOB_FILE_MISSING",
      "KNOWLEDGE_JOB_FILE_CHANGED",
      "KNOWLEDGE_JOB_FILE_INVALID",
      "FILE_INTEGRITY_MISMATCH",
    ].includes(code)
  )
    return "fileReselect";
  if (
    ["KNOWLEDGE_FORBIDDEN", "FILE_PATH_DENIED", "FILE_TYPE_DENIED"].includes(
      code,
    )
  )
    return "fileForbidden";
  if (code === "KNOWLEDGE_CONFLICT") return "fileConflict";
  if (code === "KNOWLEDGE_UPLOAD_REJECTED") return "uploadRejected";
  return "fileError";
}

export function knowledgeUploadErrorCode(error: unknown): string {
  if (error instanceof Error) {
    return (
      error.message.match(
        /\b(?:(?:KNOWLEDGE|FILE)_[A-Z0-9_]+|PROVIDER_UNAVAILABLE|AUTH_REQUIRED|CONTRACT_INVALID|PARTITION_DENIED)\b/,
      )?.[0] ?? "KNOWLEDGE_UNAVAILABLE"
    );
  }
  return "KNOWLEDGE_UNAVAILABLE";
}

export function KnowledgeFileJobQueue(props: {
  jobs: KnowledgeJobSnapshot[];
  pendingActions: Record<string, "cancel" | "retry" | "delete">;
  actionErrors: Record<string, string>;
  canCancel: boolean;
  canRetry: boolean;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  canDelete: boolean;
  deleteUnavailableReason?: string;
  onDelete: (jobId: string) => void;
}): ReactElement {
  const { t, locale } = useI18n();
  return (
    <ul className="grid gap-3" data-testid="knowledge-upload-queue">
      {props.jobs.map((job) => {
        const pending = props.pendingActions[job.jobId];
        const active = [
          "draft",
          "queued",
          "uploading",
          "processing",
          "awaiting_confirmation",
        ].includes(job.status);
        const stage = active && job.phase ? job.phase : job.status;
        const tone =
          job.status === "completed"
            ? "border-emerald-500/35 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
            : job.status === "failed" || job.status === "interrupted"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : job.status === "awaiting_confirmation" ||
                  job.status === "blocked_provider_unavailable"
                ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
                : job.status === "cancelled"
                  ? "border-border bg-muted/50 text-muted-foreground"
                  : job.status === "processing"
                    ? "border-violet-500/35 bg-violet-500/5 text-violet-700 dark:text-violet-300"
                    : "border-sky-500/35 bg-sky-500/5 text-sky-700 dark:text-sky-300";
        const progress = Number.isFinite(job.progress)
          ? Math.max(0, Math.min(100, job.progress))
          : 0;
        const error =
          props.actionErrors[job.jobId] ||
          (job.status !== "cancelled" ? job.errorCode : "");
        const errorKey = error
          ? knowledgeUploadErrorKey(error, job.status)
          : "";
        const currentStep =
          job.status === "completed"
            ? 4
            : job.status === "processing"
              ? 2
              : job.status === "uploading"
                ? 1
                : ["draft", "queued"].includes(job.status)
                  ? 0
                  : -1;
        const confirmed =
          job.lastRemoteConfirmedAt &&
          Number.isFinite(Date.parse(job.lastRemoteConfirmedAt))
            ? job.lastRemoteConfirmedAt
            : undefined;
        return (
          <li
            key={job.jobId}
            className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground"
            data-testid={`knowledge-upload-job-${job.jobId}`}
            data-status={job.status}
          >
            <div className="flex items-center justify-between gap-2">
              <strong
                className="truncate text-sm"
                title={job.fileSummary?.displayName}
              >
                {job.fileSummary?.displayName ?? job.jobId}
              </strong>
              <Badge variant="outline" className={tone}>
                {t(`knowledge.uploads.status.${stage}`)}
              </Badge>
            </div>
            {job.fileSummary?.byteSize !== undefined ? (
              <p className="text-xs text-muted-foreground">
                {formatFileSize(job.fileSummary.byteSize)}
              </p>
            ) : null}
            <ol
              className="grid grid-cols-4 gap-2 text-xs"
              aria-label={t("knowledge.uploads.stagesLabel")}
            >
              {["check", "upload", "process", "complete"].map((step, index) => (
                <li
                  key={step}
                  data-stage-state={
                    index < currentStep
                      ? "done"
                      : index === currentStep
                        ? "current"
                        : "pending"
                  }
                  aria-current={index === currentStep ? "step" : undefined}
                  className={
                    index <= currentStep
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {index < currentStep ? "✓ " : `${index + 1}. `}
                  {t(`knowledge.uploads.stages.${step}`)}
                </li>
              ))}
            </ol>
            {active ? (
              <p
                className="flex items-center gap-2 text-xs text-muted-foreground"
                role="status"
              >
                <span
                  className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {t(`knowledge.uploads.status.${stage}`)}
              </p>
            ) : null}
            <p
              className="text-xs text-muted-foreground"
              data-testid={`knowledge-upload-sync-${job.jobId}`}
            >
              {t("knowledge.uploads.lastRemoteConfirmed")}:{" "}
              {confirmed ? (
                <time dateTime={confirmed}>
                  {new Date(confirmed).toLocaleString(locale)}
                </time>
              ) : (
                t("knowledge.uploads.notRemoteConfirmed")
              )}
            </p>
            {job.status === "awaiting_confirmation" &&
            errorKey !== "remoteResultUnknown" ? (
              <p className="text-xs text-muted-foreground">
                {t("knowledge.uploads.awaitingHint")}
              </p>
            ) : null}
            {error ? (
              <p
                className="text-xs text-destructive"
                role="alert"
                data-testid={
                  error === "FILE_UPLOAD_CONTENT_UNREADABLE"
                    ? "knowledge-upload-byte-error"
                    : `knowledge-upload-error-${job.jobId}`
                }
              >
                {t(`knowledge.uploads.${errorKey}`)}
              </p>
            ) : null}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid={`knowledge-upload-details-${job.jobId}`}
                >
                  {t("knowledge.uploads.detailsLabel")}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-2 text-xs text-muted-foreground">
                {job.status === "processing" ? (
                  <>
                    <p>
                      {t("knowledge.uploads.progressLabel")}: {progress}%
                    </p>
                    <Progress
                      value={progress}
                      aria-label={t("knowledge.uploads.progressLabel")}
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                    <p>{t("knowledge.uploads.progressHint")}</p>
                  </>
                ) : null}
                {error ? (
                  <p>
                    {t("knowledge.uploads.errorCodeLabel")}: {error}
                  </p>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
            <div className="flex flex-wrap gap-2">
              {job.canCancel === true ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={`knowledge-upload-cancel-${job.jobId}`}
                  disabled={!props.canCancel || Boolean(pending)}
                  onClick={() => props.onCancel(job.jobId)}
                >
                  {t(
                    pending === "cancel"
                      ? "knowledge.uploads.cancellingLabel"
                      : "knowledge.uploads.cancelLabel",
                  )}
                </Button>
              ) : null}
              {job.canRetry === true ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={`knowledge-upload-retry-${job.jobId}`}
                  disabled={!props.canRetry || Boolean(pending)}
                  onClick={() => props.onRetry(job.jobId)}
                >
                  {t(
                    pending === "retry"
                      ? "knowledge.uploads.retryingLabel"
                      : "knowledge.uploads.retryLabel",
                  )}
                </Button>
              ) : null}
              {job.status === "failed" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={`knowledge-upload-delete-${job.jobId}`}
                  disabled={
                    !props.canDelete ||
                    !Number.isSafeInteger(job.revision) ||
                    Boolean(pending)
                  }
                  aria-label={`${t("knowledge.uploads.deleteLabel")} ${job.fileSummary?.displayName ?? job.jobId}`}
                  title={
                    props.deleteUnavailableReason ??
                    t("knowledge.uploads.deleteHint")
                  }
                  onClick={() => props.onDelete(job.jobId)}
                >
                  {t(
                    pending === "delete"
                      ? "knowledge.uploads.deletingLabel"
                      : "knowledge.uploads.deleteLabel",
                  )}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
