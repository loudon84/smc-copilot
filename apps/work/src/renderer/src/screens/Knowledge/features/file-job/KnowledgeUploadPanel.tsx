import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useI18n } from "../../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeJobSnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../../shared/knowledge/knowledge-job-ipc";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { KnowledgeFileJobQueue } from "./KnowledgeFileJobQueue";
import type { HermesKnowledgeBasesAPI } from "../../../../../../shared/knowledge/knowledge-base-ipc";

export type KnowledgeUploadPanelProps = {
  knowledgeBaseId: string;
  baseName?: string;
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

export function KnowledgeUploadPanel({
  knowledgeBaseId,
  baseName,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
  createDraft: injectedCreateDraft,
  listSnapshots: injectedListSnapshots,
  onSnapshotChanged: injectedOnSnapshotChanged,
  cancelJob: injectedCancel,
  retryJob: injectedRetry,
}: KnowledgeUploadPanelProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  } satisfies UseKnowledgeFacadeOptions);
  const lockedBaseId =
    knowledgeBaseId && knowledgeBaseId !== "unbound" ? knowledgeBaseId : "";
  const [jobs, setJobs] = useState<KnowledgeJobSnapshot[]>([]);
  const [loadState, setLoadState] = useState<
    "loading" | "unavailable" | "empty" | "content" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const subscribedRef = useRef(false);

  const createDraftFn =
    injectedCreateDraft ??
    window.hermesAPI?.knowledgeJobs?.createDraft?.bind(
      window.hermesAPI.knowledgeJobs,
    );
  const pickerEnabled = Boolean(
    probe.mutationsEnabled && lockedBaseId && createDraftFn,
  );

  useEffect(() => {
    if (!lockedBaseId) {
      setLoadState("empty");
      return;
    }
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
        const scoped = listed.filter((job) => job.knowledgeBaseId === lockedBaseId);
        setJobs(listed);
        setLoadState(scoped.length > 0 ? "content" : "empty");
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
        if (snapshot.knowledgeBaseId === lockedBaseId) {
          setLoadState("content");
        }
      });
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
      subscribedRef.current = false;
    };
  }, [
    lockedBaseId,
    probe.presentation,
    probe.mode?.dataMode,
    injectedListSnapshots,
    injectedOnSnapshotChanged,
  ]);

  const visibleJobs = useMemo(
    () => jobs.filter((job) => job.knowledgeBaseId === lockedBaseId),
    [jobs, lockedBaseId],
  );

  const upsertJob = (draft: KnowledgeJobSnapshot): void => {
    setJobs((prev) => {
      const next = prev.filter((job) => job.jobId !== draft.jobId);
      next.push(draft);
      return next;
    });
    setLoadState("content");
  };

  const handlePick = async (): Promise<void> => {
    if (!pickerEnabled || !lockedBaseId) return;
    const api = window.hermesAPI?.knowledgeJobs;
    const createDraft = injectedCreateDraft ?? api?.createDraft?.bind(api);
    const cancel = injectedCancel ?? api?.cancel?.bind(api);
    if (!createDraft) return;
    const draft = await createDraft({ knowledgeBaseId: lockedBaseId });
    upsertJob(draft);

    const filesApi = window.hermesAPI?.files;
    if (!filesApi?.pickFiles) return;
    const results = await filesApi.pickFiles(
      { multiple: false },
      { knowledgeJobId: draft.jobId, mode: "local", source: "picker" },
    );
    const imported = results.filter((result) => result.ok);
    if (imported.length === 0 && cancel) {
      const cancelled = await cancel({ jobId: draft.jobId });
      upsertJob(cancelled);
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

  if (!lockedBaseId) {
    return (
      <div data-testid="knowledge-upload-panel" data-state="empty" className="px-6 pb-6">
        <EmptyState
          title={t("knowledge.uploads.title")}
          description={t("knowledge.uploads.pickerDisabledProvider")}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="knowledge-upload-panel"
      data-state={loadState}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6"
    >
      {loadState === "loading" ? (
        <p className="text-xs text-muted-foreground">{t("knowledge.loading")}</p>
      ) : null}
      {loadState === "unavailable" ? (
        <EmptyState
          title={t("knowledge.unavailableTitle")}
          description={t("knowledge.uploads.pickerBlocked")}
        />
      ) : null}
      {loadState === "error" ? (
        <EmptyState
          title={t("knowledge.host.errorTitle")}
          description={errorMessage}
        />
      ) : null}

      {loadState === "empty" || loadState === "content" ? (
        <>
          <div className="grid gap-2">
            <p
              data-testid="knowledge-upload-target"
              className="text-xs text-muted-foreground"
            >
              {t("knowledge.uploads.targetBase")}: {baseName || lockedBaseId}
            </p>
            <Button
              type="button"
              variant="outline"
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
            </Button>
            {pickerEnabled ? null : (
              <p className="text-xs text-muted-foreground">
                {t("knowledge.uploads.pickerDisabledProvider")}
              </p>
            )}
          </div>

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
