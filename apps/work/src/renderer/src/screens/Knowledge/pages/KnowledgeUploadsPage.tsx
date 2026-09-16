import { useEffect, useRef, useState, type ReactElement } from "react";
import { useI18n } from "../../../components/useI18n";
import { FilePickerButton } from "../../../components/files/composer/FilePickerButton";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeFacadeEntitySnapshot,
  KnowledgeJobSnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import {
  KnowledgeEmptyState,
  KnowledgeLoading,
  KnowledgeToolbar,
} from "../knowledge-page-chrome";

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
  const [bases, setBases] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [targetBaseId, setTargetBaseId] = useState("unbound");
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
        if (probe.facade && probe.mode?.dataMode === "mock") {
          const listedBases = await probe.facade.listEntities({ kind: "base" });
          if (!cancelled) setBases(listedBases);
        }
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
    probe.facade,
    injectedListSnapshots,
    injectedOnSnapshotChanged,
  ]);

  const upsertJob = (draft: KnowledgeJobSnapshot): void => {
    setJobs((prev) => {
      const next = prev.filter((job) => job.jobId !== draft.jobId);
      next.push(draft);
      return next;
    });
    setLoadState("content");
  };

  const handlePick = async (): Promise<void> => {
    if (!pickerEnabled) return;
    const api = window.hermesAPI?.knowledgeJobs;
    const createDraft = injectedCreateDraft ?? api?.createDraft?.bind(api);
    if (!createDraft) return;
    const draft = await createDraft({ knowledgeBaseId: targetBaseId });
    upsertJob(draft);
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
      {loadState === "loading" ? (
        <KnowledgeLoading label={t("knowledge.loading")} />
      ) : null}
      {loadState === "unavailable" ? (
        <KnowledgeEmptyState
          title={t("knowledge.unavailableTitle")}
          description={t("knowledge.uploads.pickerBlocked")}
        />
      ) : null}
      {loadState === "error" ? (
        <KnowledgeEmptyState
          title={t("knowledge.host.errorTitle")}
          description={errorMessage}
        />
      ) : null}

      {loadState === "empty" || loadState === "content" ? (
        <>
          <KnowledgeToolbar>
            <label>
              {t("knowledge.uploads.targetBase")}
              <select
                data-testid="knowledge-upload-target"
                value={targetBaseId}
                disabled={!pickerEnabled}
                onChange={(event) => setTargetBaseId(event.target.value)}
              >
                <option value="unbound">{t("knowledge.uploads.unboundTarget")}</option>
                {bases.map((base) => (
                  <option key={base.id} value={base.id}>
                    {base.title ?? base.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
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
            <FilePickerButton
              className="btn btn-secondary btn-sm"
              disabled={!pickerEnabled}
              title={t("knowledge.uploads.pickerLabel")}
              onPicked={() => {
                void handlePick();
              }}
            />
            {pickerEnabled ? (
              <button
                type="button"
                className="btn btn-sm"
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
          </KnowledgeToolbar>

          {jobs.length === 0 ? (
            <p data-testid="knowledge-upload-queue-empty">
              {t("knowledge.uploads.emptyList")}
            </p>
          ) : (
            <ul className="knowledge-card-grid" data-testid="knowledge-upload-queue">
              {jobs.map((job) => (
                <li
                  key={job.jobId}
                  className="settings-card"
                  data-testid={`knowledge-upload-job-${job.jobId}`}
                  data-status={job.status}
                >
                  <div className="settings-card-head">
                    <strong>
                      {job.fileSummary?.displayName ?? job.jobId}
                    </strong>
                    <span className="settings-card-badge">{job.status}</span>
                  </div>
                  <p>
                    {t("knowledge.uploads.progressLabel")}: {job.progress}%
                  </p>
                  <div className="knowledge-upload-progress">
                    <div
                      className="knowledge-upload-progress-bar"
                      style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                    />
                  </div>
                  <div className="knowledge-toolbar">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      data-testid={`knowledge-upload-cancel-${job.jobId}`}
                      onClick={() => {
                        void handleCancel(job.jobId);
                      }}
                    >
                      {t("knowledge.uploads.cancelLabel")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      data-testid={`knowledge-upload-retry-${job.jobId}`}
                      onClick={() => {
                        void handleRetry(job.jobId);
                      }}
                    >
                      {t("knowledge.uploads.retryLabel")}
                    </button>
                  </div>
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
