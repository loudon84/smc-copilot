import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
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
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import {
  KnowledgeEmptyState,
  KnowledgeLoading,
  KnowledgeToolbar,
} from "../knowledge-page-chrome";
import { KnowledgeFileJobQueue } from "../features/file-job/KnowledgeFileJobQueue";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeBaseSnapshot,
} from "../../../../../shared/knowledge/knowledge-base-ipc";

export type KnowledgeUploadsPageProps = {
  params?: KnowledgeRouteParams;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
  bases?: HermesKnowledgeBasesAPI | null;
  createDraft?: (input?: {
    knowledgeBaseId?: string;
  }) => Promise<KnowledgeJobSnapshot>;
  listSnapshots?: () => Promise<KnowledgeJobSnapshot[]>;
  onSnapshotChanged?: (
    callback: (snapshot: KnowledgeJobSnapshot) => void,
  ) => () => void;
  cancelJob?: (input: { jobId: string }) => Promise<KnowledgeJobSnapshot>;
  retryJob?: (input: { jobId: string }) => Promise<KnowledgeJobSnapshot>;
};

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

export function KnowledgeUploadsPage({
  params = {},
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
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
    bases: injectedBases,
  } satisfies UseKnowledgeFacadeOptions);
  const routeBaseId = params.knowledgeBaseId;
  const [jobs, setJobs] = useState<KnowledgeJobSnapshot[]>([]);
  const [bases, setBases] = useState<KnowledgeBaseSnapshot[]>([]);
  const [targetBaseId, setTargetBaseId] = useState(routeBaseId ?? "unbound");
  const [loadState, setLoadState] = useState<
    "loading" | "unavailable" | "empty" | "content" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (routeBaseId) setTargetBaseId(routeBaseId);
  }, [routeBaseId]);

  const pickerEnabled =
    probe.mutationsEnabled &&
    (targetBaseId !== "unbound" || injectedCreateDraft !== undefined);

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
        if (probe.bases) {
          const page = await probe.bases.list({ page: 1, pageSize: 50 });
          if (!cancelled) setBases(page.items);
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(errorCode(error));
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
    probe.bases,
    injectedListSnapshots,
    injectedOnSnapshotChanged,
  ]);

  const visibleJobs = useMemo(() => {
    if (!routeBaseId) return jobs;
    return jobs.filter((job) => job.knowledgeBaseId === routeBaseId);
  }, [jobs, routeBaseId]);

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
    if (routeBaseId && targetBaseId !== routeBaseId) {
      setErrorMessage("KNOWLEDGE_JOB_TARGET_MISMATCH");
      return;
    }
    const api = window.hermesAPI?.knowledgeJobs;
    const createDraft = injectedCreateDraft ?? api?.createDraft?.bind(api);
    const cancel = injectedCancel ?? api?.cancel?.bind(api);
    if (!createDraft) return;
    const draft = await createDraft({ knowledgeBaseId: targetBaseId });
    upsertJob(draft);

    const filesApi = window.hermesAPI?.files;
    if (!filesApi?.pickFiles) return;
    const results = await filesApi.pickFiles(
      { multiple: false },
      { knowledgeJobId: draft.jobId, mode: "local", source: "picker" },
    );
    const imported = results.filter((result) => result.ok);
    if (imported.length === 0) {
      if (cancel) {
        const cancelled = await cancel({ jobId: draft.jobId });
        upsertJob(cancelled);
      }
    }
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
                disabled={!probe.mutationsEnabled || Boolean(routeBaseId)}
                onChange={(event) => setTargetBaseId(event.target.value)}
              >
                <option value="unbound">{t("knowledge.uploads.unboundTarget")}</option>
                {bases.map((base) => (
                  <option key={base.id} value={base.id}>
                    {base.name}
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
            {pickerEnabled ? null : (
              <p>{t("knowledge.uploads.pickerDisabledProvider")}</p>
            )}
          </KnowledgeToolbar>

          <KnowledgeFileJobQueue
            jobs={visibleJobs}
            emptyLabel={t("knowledge.uploads.emptyList")}
            progressLabel={t("knowledge.uploads.progressLabel")}
            cancelLabel={t("knowledge.uploads.cancelLabel")}
            retryLabel={t("knowledge.uploads.retryLabel")}
            onCancel={(jobId) => {
              void handleCancel(jobId);
            }}
            onRetry={(jobId) => {
              void handleRetry(jobId);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

export default KnowledgeUploadsPage;
