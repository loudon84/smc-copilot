import { useEffect, useRef, useState, type ReactElement } from "react";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeJobSnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";

export type KnowledgeUploadsPageProps = {
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
  /** Optional createDraft override for tests. */
  createDraft?: (input?: {
    knowledgeBaseId?: string;
  }) => Promise<KnowledgeJobSnapshot>;
  /** Optional listSnapshots override for tests. */
  listSnapshots?: () => Promise<KnowledgeJobSnapshot[]>;
  /** Optional subscribe override for tests. */
  onSnapshotChanged?: (
    callback: (snapshot: KnowledgeJobSnapshot) => void,
  ) => () => void;
  cancelJob?: (input: { jobId: string }) => Promise<KnowledgeJobSnapshot>;
  retryJob?: (input: { jobId: string }) => Promise<KnowledgeJobSnapshot>;
};

/**
 * Knowledge Uploads page — consumes Main knowledgeJobs snapshots only.
 * Never owns a Renderer progress timer (Main snapshots only).
 */
export function KnowledgeUploadsPage({
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  createDraft: injectedCreateDraft,
  listSnapshots: injectedListSnapshots,
  onSnapshotChanged: injectedOnSnapshotChanged,
  cancelJob: injectedCancel,
  retryJob: injectedRetry,
}: KnowledgeUploadsPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  } satisfies UseKnowledgeFacadeOptions);
  const [jobs, setJobs] = useState<KnowledgeJobSnapshot[]>([]);
  const [loadState, setLoadState] = useState<
    "loading" | "unavailable" | "empty" | "content" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const subscribedRef = useRef(false);

  const pickerEnabled =
    probe.mode?.dataMode === "mock" && probe.mutationsEnabled;

  useEffect(() => {
    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (
      probe.presentation === "unavailable" &&
      probe.mode?.dataMode !== "mock"
    ) {
      setLoadState("unavailable");
      return;
    }

    const api = window.hermesAPI?.knowledgeJobs;
    const listSnapshots =
      injectedListSnapshots ?? api?.listSnapshots?.bind(api);
    const onSnapshotChanged =
      injectedOnSnapshotChanged ?? api?.onSnapshotChanged?.bind(api);

    if (!listSnapshots) {
      setLoadState("unavailable");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const listed = await listSnapshots();
        if (cancelled) return;
        setJobs(listed);
        setLoadState(listed.length > 0 ? "content" : "empty");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : t("knowledge.host.errorTitle"),
        );
        setLoadState("error");
      }
    })();

    let unsubscribe: (() => void) | undefined;
    if (onSnapshotChanged && !subscribedRef.current) {
      subscribedRef.current = true;
      unsubscribe = onSnapshotChanged((snapshot) => {
        setJobs((prev) => {
          const next = prev.filter((job) => job.jobId !== snapshot.jobId);
          next.push(snapshot);
          return next;
        });
        setLoadState("content");
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
      subscribedRef.current = false;
    };
  }, [
    probe.presentation,
    probe.mode?.dataMode,
    injectedListSnapshots,
    injectedOnSnapshotChanged,
  ]);

  const handlePick = async (): Promise<void> => {
    if (!pickerEnabled) return;
    const api = window.hermesAPI?.knowledgeJobs;
    const createDraft = injectedCreateDraft ?? api?.createDraft?.bind(api);
    if (!createDraft) return;
    const draft = await createDraft({ knowledgeBaseId: "unbound" });
    setJobs((prev) => {
      const next = prev.filter((job) => job.jobId !== draft.jobId);
      next.push(draft);
      return next;
    });
    setLoadState("content");
  };

  const handleCancel = async (jobId: string): Promise<void> => {
    const api = window.hermesAPI?.knowledgeJobs;
    const cancel = injectedCancel ?? api?.cancel?.bind(api);
    if (!cancel) return;
    const snapshot = await cancel({ jobId });
    setJobs((prev) =>
      prev.map((job) => (job.jobId === jobId ? snapshot : job)),
    );
  };

  const handleRetry = async (jobId: string): Promise<void> => {
    const api = window.hermesAPI?.knowledgeJobs;
    const retry = injectedRetry ?? api?.retry?.bind(api);
    if (!retry) return;
    const snapshot = await retry({ jobId });
    setJobs((prev) =>
      prev.map((job) => (job.jobId === jobId ? snapshot : job)),
    );
  };

  return (
    <div data-testid="knowledge-uploads-page" data-state={loadState}>
      {loadState === "loading" ? <p>{t("knowledge.loading")}</p> : null}
      {loadState === "unavailable" ? (
        <section className="gateway-empty-state" aria-live="polite">
          <strong>{t("knowledge.unavailableTitle")}</strong>
          <p>{t("knowledge.uploads.pickerBlocked")}</p>
        </section>
      ) : null}
      {loadState === "error" ? (
        <section>
          <strong>{t("knowledge.host.errorTitle")}</strong>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {loadState === "empty" || loadState === "content" ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              data-testid="knowledge-upload-picker"
              disabled={!pickerEnabled}
              title={
                pickerEnabled
                  ? undefined
                  : t("knowledge.uploads.pickerDisabledProvider")
              }
              onClick={() => {
                void handlePick();
              }}
            >
              {t("knowledge.uploads.pickerLabel")}
            </button>
            {/* Intentionally no knowledge-upload-submit in provider mode */}
            {pickerEnabled ? (
              <button
                type="button"
                data-testid="knowledge-upload-submit"
                onClick={() => {
                  void handlePick();
                }}
              >
                {t("knowledge.uploads.pickerLabel")}
              </button>
            ) : (
              <p>{t("knowledge.uploads.pickerDisabledProvider")}</p>
            )}
          </div>

          {jobs.length === 0 ? (
            <p data-testid="knowledge-upload-queue-empty">
              {t("knowledge.uploads.emptyList")}
            </p>
          ) : (
            <ul data-testid="knowledge-upload-queue">
              {jobs.map((job) => (
                <li
                  key={job.jobId}
                  data-testid={`knowledge-upload-job-${job.jobId}`}
                  data-status={job.status}
                >
                  <span>
                    {job.fileSummary?.displayName ?? job.jobId} — {job.status}
                  </span>
                  <span>
                    {" "}
                    {t("knowledge.uploads.progressLabel")}: {job.progress}%
                  </span>
                  <button
                    type="button"
                    data-testid={`knowledge-upload-cancel-${job.jobId}`}
                    onClick={() => {
                      void handleCancel(job.jobId);
                    }}
                  >
                    {t("knowledge.uploads.cancelLabel")}
                  </button>
                  <button
                    type="button"
                    data-testid={`knowledge-upload-retry-${job.jobId}`}
                    onClick={() => {
                      void handleRetry(job.jobId);
                    }}
                  >
                    {t("knowledge.uploads.retryLabel")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}

export default KnowledgeUploadsPage;
