import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useI18n } from "../../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeFacadeAPI,
  HermesKnowledgeJobsAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeJobSnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../../shared/knowledge/knowledge-job-ipc";
import { EmptyState } from "@/components/common/empty-state";
import { SearchInput } from "@/components/common/search-input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useFileDrop } from "../../../../hooks/files/useFileDrop";
import {
  KnowledgeFileJobQueue,
  knowledgeUploadErrorCode,
  knowledgeUploadErrorKey,
} from "./KnowledgeFileJobQueue";
import type { HermesKnowledgeBasesAPI } from "../../../../../../shared/knowledge/knowledge-base-ipc";

const FILE_ROWS_PER_PAGE = 30;

export type KnowledgeUploadPanelProps = {
  knowledgeBaseId: string;
  active?: boolean;
  baseName?: string;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
  bases?: HermesKnowledgeBasesAPI | null;
  pickAndUpload?: HermesKnowledgeJobsAPI["pickAndUpload"];
  dropAndUpload?: HermesKnowledgeJobsAPI["dropAndUpload"];
  deleteCancelled?: HermesKnowledgeJobsAPI["deleteCancelled"];
  listSnapshots?: HermesKnowledgeJobsAPI["listSnapshots"];
  onSnapshotChanged?: HermesKnowledgeJobsAPI["onSnapshotChanged"];
  onJobRemoved?: HermesKnowledgeJobsAPI["onJobRemoved"];
  cancelJob?: HermesKnowledgeJobsAPI["cancel"];
  retryJob?: HermesKnowledgeJobsAPI["retry"];
  refreshStatus?: HermesKnowledgeJobsAPI["refreshStatus"];
  onRefreshCapability?: () => Promise<KnowledgeCapabilitySnapshot | null>;
  onSnapshotsReconciled?: (snapshots: KnowledgeJobSnapshot[]) => void;
};

function mergeSnapshots(
  previous: KnowledgeJobSnapshot[],
  incoming: KnowledgeJobSnapshot[],
): KnowledgeJobSnapshot[] {
  const byId = new Map(previous.map((job) => [job.jobId, job]));
  for (const snapshot of incoming) {
    const existing = byId.get(snapshot.jobId);
    if (existing && !isNewerSnapshot(existing, snapshot)) continue;
    byId.set(snapshot.jobId, snapshot);
  }
  return [...byId.values()];
}

function isNewerSnapshot(
  existing: KnowledgeJobSnapshot,
  incoming: KnowledgeJobSnapshot,
): boolean {
  if (existing.revision !== undefined || incoming.revision !== undefined)
    return (incoming.revision ?? -1) > (existing.revision ?? -1);
  return !(Date.parse(incoming.updatedAt) < Date.parse(existing.updatedAt));
}

function batchCounts(jobs: KnowledgeJobSnapshot[]): Record<string, number> {
  const counts = {
    total: jobs.length,
    queued: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    awaitingConfirmation: 0,
  };
  for (const job of jobs) {
    if (job.status === "awaiting_confirmation")
      counts.awaitingConfirmation += 1;
    else if (job.status === "completed") counts.completed += 1;
    else if (job.status === "cancelled") counts.cancelled += 1;
    else if (
      ["failed", "interrupted", "blocked_provider_unavailable"].includes(
        job.status,
      )
    )
      counts.failed += 1;
    else if (
      job.status === "uploading" ||
      job.status === "processing" ||
      job.phase
    )
      counts.inProgress += 1;
    else counts.queued += 1;
  }
  return counts;
}

export function KnowledgeUploadPanel({
  knowledgeBaseId,
  active = true,
  baseName,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
  pickAndUpload: injectedPick,
  dropAndUpload: injectedDrop,
  deleteCancelled: injectedDelete,
  listSnapshots: injectedListSnapshots,
  onSnapshotChanged: injectedOnSnapshotChanged,
  onJobRemoved: injectedOnJobRemoved,
  cancelJob: injectedCancel,
  retryJob: injectedRetry,
  onRefreshCapability,
  onSnapshotsReconciled,
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
  const jobsRef = useRef<KnowledgeJobSnapshot[]>([]);
  const removedRef = useRef(new Set<string>());
  const generationRef = useRef(0);
  const pickingRef = useRef(false);
  const pendingRef = useRef(new Set<string>());
  const [picking, setPicking] = useState(false);
  const [pendingActions, setPendingActions] = useState<
    Record<string, "cancel" | "retry" | "delete">
  >({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<
    "loading" | "unavailable" | "empty" | "content" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [pickError, setPickError] = useState("");
  const [reloadResult, setReloadResult] = useState("");
  const [reloading, setReloading] = useState(false);
  const reloadPending = useRef(false);
  const reloadRequest = useRef(0);
  const readLocalRef = useRef<() => Promise<boolean>>(async () => false);
  const reconciledCallback = useRef(onSnapshotsReconciled);
  reconciledCallback.current = onSnapshotsReconciled;
  const mountedRef = useRef(true);
  const currentBase = useRef(lockedBaseId);
  currentBase.current = lockedBaseId;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    reloadRequest.current += 1;
    reloadPending.current = false;
    setReloading(false);
    return () => {
      reloadRequest.current += 1;
    };
  }, [lockedBaseId]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedBatches, setExpandedBatches] = useState<
    Record<string, boolean>
  >({});
  const [visibleRows, setVisibleRows] = useState<Record<string, number>>({});
  const api = window.hermesAPI?.knowledgeJobs;
  const pick = injectedPick ?? api?.pickAndUpload?.bind(api);
  const drop = injectedDrop ?? api?.dropAndUpload?.bind(api);
  const remove = injectedDelete ?? api?.deleteCancelled?.bind(api);
  const cancel = injectedCancel ?? api?.cancel?.bind(api);
  const retry = injectedRetry ?? api?.retry?.bind(api);
  const pickerEnabled = Boolean(
    active && probe.mutationsEnabled && lockedBaseId && pick,
  );
  const dropEnabled = Boolean(
    active && probe.mutationsEnabled && lockedBaseId && drop,
  );
  const pickerDisabledMessage = t(
    probe.mutationsEnabled && !pick
      ? "knowledge.uploads.pickerRequiresRestart"
      : "knowledge.uploads.pickerDisabledProvider",
  );

  const applySnapshots = (
    incoming: KnowledgeJobSnapshot[],
    listedStartIds?: Set<string>,
  ): void => {
    const visible = incoming.filter(
      (job) =>
        job.knowledgeBaseId === lockedBaseId &&
        !removedRef.current.has(job.jobId),
    );
    const visibleIds = new Set(visible.map((job) => job.jobId));
    const previous = listedStartIds
      ? jobsRef.current.filter(
          (job) => !listedStartIds.has(job.jobId) || visibleIds.has(job.jobId),
        )
      : jobsRef.current;
    jobsRef.current = mergeSnapshots(previous, visible);
    setJobs(jobsRef.current);
    setLoadState(jobsRef.current.length ? "content" : "empty");
    reconciledCallback.current?.(jobsRef.current);
  };

  const removeSnapshot = (jobId: string): void => {
    removedRef.current.add(jobId);
    jobsRef.current = jobsRef.current.filter((job) => job.jobId !== jobId);
    setJobs(jobsRef.current);
    setLoadState(jobsRef.current.length ? "content" : "empty");
    reconciledCallback.current?.(jobsRef.current);
  };

  useEffect(() => {
    removedRef.current.clear();
  }, [lockedBaseId]);

  useEffect(() => {
    const generation = ++generationRef.current;
    jobsRef.current = [];
    setJobs([]);
    setErrorMessage("");
    setPickError("");
    setActionErrors({});
    setReloadResult("");
    pickingRef.current = false;
    pendingRef.current.clear();
    setPicking(false);
    setPendingActions({});
    if (!lockedBaseId) {
      setLoadState("empty");
      return;
    }
    const liveApi = window.hermesAPI?.knowledgeJobs;
    const listSnapshots =
      injectedListSnapshots ?? liveApi?.listSnapshots?.bind(liveApi);
    const onSnapshotChanged =
      injectedOnSnapshotChanged ?? liveApi?.onSnapshotChanged?.bind(liveApi);
    const onJobRemoved =
      injectedOnJobRemoved ?? liveApi?.onJobRemoved?.bind(liveApi);
    if (!listSnapshots) {
      setErrorMessage("KNOWLEDGE_UPLOAD_BRIDGE_UNAVAILABLE");
      setLoadState("unavailable");
      return;
    }
    let disposed = false;
    let frame: number | undefined;
    const pendingSnapshots = new Map<string, KnowledgeJobSnapshot>();
    const flushEvents = (): void => {
      frame = undefined;
      if (disposed || generationRef.current !== generation) return;
      const snapshots = [...pendingSnapshots.values()];
      pendingSnapshots.clear();
      if (snapshots.length) applySnapshots(snapshots);
    };
    const unsubscribe = onSnapshotChanged?.((snapshot) => {
      if (disposed || snapshot.knowledgeBaseId !== lockedBaseId) return;
      const pending = pendingSnapshots.get(snapshot.jobId);
      if (!pending || isNewerSnapshot(pending, snapshot))
        pendingSnapshots.set(snapshot.jobId, snapshot);
      if (frame === undefined)
        frame = window.requestAnimationFrame
          ? window.requestAnimationFrame(flushEvents)
          : window.setTimeout(flushEvents, 16);
    });
    const unsubscribeRemoved = onJobRemoved?.((removed) => {
      if (!disposed && removed.knowledgeBaseId === lockedBaseId) {
        pendingSnapshots.delete(removed.jobId);
        removeSnapshot(removed.jobId);
      }
    });
    let inFlight: Promise<boolean> | undefined;
    const readLocal = (): Promise<boolean> => {
      if (disposed) return Promise.resolve(false);
      if (inFlight) return inFlight;
      const listedStartIds = new Set(jobsRef.current.map((job) => job.jobId));
      inFlight = Promise.resolve()
        .then(() => listSnapshots())
        .then((listed) => {
          if (!disposed && generationRef.current === generation) {
            setErrorMessage("");
            applySnapshots(listed, listedStartIds);
          }
          return true;
        })
        .catch((error) => {
          if (disposed || generationRef.current !== generation) return false;
          setErrorMessage(knowledgeUploadErrorCode(error));
          if (jobsRef.current.length === 0) setLoadState("error");
          return false;
        })
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight!;
    };
    readLocalRef.current = readLocal;
    if (active && document.visibilityState !== "hidden") void readLocal();
    return () => {
      disposed = true;
      generationRef.current += 1;
      if (frame !== undefined) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
        else window.clearTimeout(frame);
      }
      unsubscribe?.();
      unsubscribeRemoved?.();
    };
  }, [
    lockedBaseId,
    injectedListSnapshots,
    injectedOnSnapshotChanged,
    injectedOnJobRemoved,
  ]);

  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current && document.visibilityState !== "hidden")
      void readLocalRef.current();
    wasActive.current = active;
    const onVisible = (): void => {
      if (active && document.visibilityState !== "hidden")
        void readLocalRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active]);

  const handleReconnect = async (): Promise<void> => {
    if (!active || reloadPending.current) return;
    reloadPending.current = true;
    setReloading(true);
    const base = lockedBaseId;
    const request = ++reloadRequest.current;
    const isCurrent = (): boolean =>
      mountedRef.current &&
      currentBase.current === base &&
      reloadRequest.current === request;
    setReloadResult("");
    try {
      const capability = onRefreshCapability
        ? await onRefreshCapability()
        : await probe.refreshCapability();
      if (isCurrent())
        setReloadResult(
          t(
            capability?.available
              ? "knowledge.uploads.reconnectDone"
              : "knowledge.uploads.reconnectUnavailable",
          ),
        );
    } catch (error) {
      if (isCurrent()) setErrorMessage(knowledgeUploadErrorCode(error));
    } finally {
      if (isCurrent()) {
        reloadPending.current = false;
        setReloading(false);
      }
    }
  };

  const batches = useMemo(() => {
    const sorted = jobs
      .slice()
      .sort(
        (left, right) =>
          (Date.parse(right.createdAt ?? "") || 0) -
            (Date.parse(left.createdAt ?? "") || 0) ||
          left.jobId.localeCompare(right.jobId),
      );
    const grouped = new Map<string, KnowledgeJobSnapshot[]>();
    for (const job of sorted) {
      const key = job.batchId ?? "legacy";
      const group = grouped.get(key) ?? [];
      group.push(job);
      grouped.set(key, group);
    }
    return [...grouped].map(([id, items]) => ({
      id,
      jobs: items,
      counts: batchCounts(items),
    }));
  }, [jobs]);

  const handlePick = async (): Promise<void> => {
    if (!pickerEnabled || !pick || pickingRef.current) return;
    const generation = generationRef.current;
    pickingRef.current = true;
    setPicking(true);
    setPickError("");
    try {
      const result = await pick({ knowledgeBaseId: lockedBaseId });
      if (generationRef.current === generation) applySnapshots(result.jobs);
    } catch (error) {
      if (generationRef.current === generation)
        setPickError(knowledgeUploadErrorCode(error));
    } finally {
      if (generationRef.current === generation) {
        pickingRef.current = false;
        setPicking(false);
      }
    }
  };

  const handleDrop = async (files: File[]): Promise<void> => {
    if (!dropEnabled || !drop || pickingRef.current) return;
    const generation = generationRef.current;
    pickingRef.current = true;
    setPicking(true);
    setPickError("");
    try {
      const result = await drop({ knowledgeBaseId: lockedBaseId, files });
      if (generationRef.current === generation) applySnapshots(result.jobs);
    } catch (error) {
      if (generationRef.current === generation)
        setPickError(knowledgeUploadErrorCode(error));
    } finally {
      if (generationRef.current === generation) {
        pickingRef.current = false;
        setPicking(false);
      }
    }
  };
  const fileDrop = useFileDrop({
    onFiles: (files) => {
      void handleDrop(files);
    },
    disabled: !dropEnabled || picking,
  });
  const filterCounts = {
    all: jobs.length,
    inProgress: jobs.filter((job) =>
      ["draft", "queued", "uploading", "processing"].includes(job.status),
    ).length,
    needsAttention: jobs.filter((job) =>
      [
        "failed",
        "interrupted",
        "blocked_provider_unavailable",
        "awaiting_confirmation",
      ].includes(job.status),
    ).length,
    completed: jobs.filter((job) => job.status === "completed").length,
  };
  const unqueryableConfirmationCount = jobs.filter(
    (job) =>
      job.status === "awaiting_confirmation" &&
      job.dataMode === probe.mode?.dataMode &&
      job.canQueryRemoteStatus === false,
  ).length;

  const handleAction = async (
    jobId: string,
    action: "cancel" | "retry",
  ): Promise<void> => {
    const job = jobsRef.current.find((item) => item.jobId === jobId);
    const command = action === "cancel" ? cancel : retry;
    if (
      !active ||
      !probe.mutationsEnabled ||
      !command ||
      pendingRef.current.has(jobId) ||
      !(action === "cancel" ? job?.canCancel : job?.canRetry)
    )
      return;
    const generation = generationRef.current;
    pendingRef.current.add(jobId);
    setPendingActions((previous) => ({ ...previous, [jobId]: action }));
    setActionErrors((previous) => ({ ...previous, [jobId]: "" }));
    try {
      const snapshot = await command({ jobId });
      if (generationRef.current === generation) applySnapshots([snapshot]);
    } catch (error) {
      if (generationRef.current === generation)
        setActionErrors((previous) => ({
          ...previous,
          [jobId]: knowledgeUploadErrorCode(error),
        }));
    } finally {
      if (generationRef.current === generation) {
        pendingRef.current.delete(jobId);
        setPendingActions((previous) => {
          const next = { ...previous };
          delete next[jobId];
          return next;
        });
      }
    }
  };

  const handleBatchAction = async (
    batchJobs: KnowledgeJobSnapshot[],
    action: "cancel" | "retry",
  ): Promise<void> => {
    const command = action === "cancel" ? cancel : retry;
    if (!active || !probe.mutationsEnabled || !command) return;
    const generation = generationRef.current;
    const selected = batchJobs.filter(
      (job) =>
        !pendingRef.current.has(job.jobId) &&
        (action === "cancel" ? job.canCancel : job.canRetry),
    );
    if (!selected.length) return;
    for (const job of selected) pendingRef.current.add(job.jobId);
    setPendingActions((previous) => {
      const next = { ...previous };
      for (const job of selected) next[job.jobId] = action;
      return next;
    });
    setActionErrors((previous) => {
      const next = { ...previous };
      for (const job of selected) delete next[job.jobId];
      return next;
    });
    const snapshots: KnowledgeJobSnapshot[] = [];
    const errors: Record<string, string> = {};
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < selected.length && generationRef.current === generation) {
        const job = selected[next++]!;
        try {
          snapshots.push(await command({ jobId: job.jobId }));
        } catch (error) {
          errors[job.jobId] = knowledgeUploadErrorCode(error);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(2, selected.length) }, worker),
    );
    if (generationRef.current !== generation) return;
    if (snapshots.length) applySnapshots(snapshots);
    if (Object.keys(errors).length)
      setActionErrors((previous) => ({ ...previous, ...errors }));
    for (const job of selected) pendingRef.current.delete(job.jobId);
    setPendingActions((previous) => {
      const next = { ...previous };
      for (const job of selected) delete next[job.jobId];
      return next;
    });
  };

  const handleDelete = async (jobId: string): Promise<void> => {
    const job = jobsRef.current.find((item) => item.jobId === jobId);
    if (
      !active ||
      !remove ||
      job?.status !== "failed" ||
      !Number.isSafeInteger(job.revision) ||
      pendingRef.current.has(jobId)
    )
      return;
    const generation = generationRef.current;
    pendingRef.current.add(jobId);
    setPendingActions((previous) => ({ ...previous, [jobId]: "delete" }));
    setActionErrors((previous) => ({ ...previous, [jobId]: "" }));
    try {
      const removed = await remove({ jobId, expectedRevision: job.revision! });
      if (
        generationRef.current === generation &&
        removed.knowledgeBaseId === lockedBaseId
      )
        removeSnapshot(removed.jobId);
    } catch (error) {
      if (generationRef.current === generation)
        setActionErrors((previous) => ({
          ...previous,
          [jobId]: knowledgeUploadErrorCode(error),
        }));
    } finally {
      pendingRef.current.delete(jobId);
      if (generationRef.current === generation)
        setPendingActions((previous) => {
          const next = { ...previous };
          delete next[jobId];
          return next;
        });
    }
  };

  const renderError = (code: string, testId: string): ReactElement | null =>
    code ? (
      <div data-testid={testId} className="text-xs">
        <p role="alert" className="text-destructive">
          {t(`knowledge.uploads.${knowledgeUploadErrorKey(code)}`)}
        </p>
        <details className="text-muted-foreground">
          <summary>{t("knowledge.uploads.detailsLabel")}</summary>
          {t("knowledge.uploads.errorCodeLabel")}: {code}
        </details>
      </div>
    ) : null;
  const matchesJob = (job: KnowledgeJobSnapshot): boolean => {
    const searching = search.trim().toLocaleLowerCase();
    return (
      (!searching ||
        (job.fileSummary?.displayName ?? job.jobId)
          .toLocaleLowerCase()
          .includes(searching)) &&
      (filter === "all" ||
        (filter === "inProgress" &&
          ["draft", "queued", "uploading", "processing"].includes(
            job.status,
          )) ||
        (filter === "needsAttention" &&
          [
            "failed",
            "interrupted",
            "blocked_provider_unavailable",
            "awaiting_confirmation",
          ].includes(job.status)) ||
        (filter === "completed" && job.status === "completed"))
    );
  };

  if (!lockedBaseId)
    return (
      <div
        data-testid="knowledge-upload-panel"
        data-state="empty"
        className="pb-6"
      >
        <EmptyState
          title={t("knowledge.uploads.title")}
          description={t("knowledge.uploads.pickerDisabledProvider")}
        />
      </div>
    );

  return (
    <div
      data-testid="knowledge-upload-panel"
      data-state={loadState}
      className="grid min-w-0 gap-5 pb-6"
    >
      {!probe.mutationsEnabled ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!active || reloading}
            data-testid="knowledge-upload-reconnect"
            onClick={() => {
              void handleReconnect();
            }}
          >
            {t("knowledge.uploads.reconnectLabel")}
          </Button>
        </div>
      ) : null}
      {loadState === "loading" ? (
        <p className="text-xs text-muted-foreground">
          {t("knowledge.loading")}
        </p>
      ) : null}
      {loadState === "unavailable" ? (
        <EmptyState
          title={t("knowledge.unavailableTitle")}
          description={t(
            `knowledge.uploads.${knowledgeUploadErrorKey(errorMessage || (probe.capability?.status === "auth_required" ? "KNOWLEDGE_AUTH_REQUIRED" : "KNOWLEDGE_UNAVAILABLE"))}`,
          )}
        />
      ) : null}
      {loadState === "error" ? (
        <EmptyState
          title={t("knowledge.host.errorTitle")}
          description={t(
            `knowledge.uploads.${knowledgeUploadErrorKey(errorMessage)}`,
          )}
        />
      ) : null}
      {errorMessage
        ? renderError(errorMessage, "knowledge-upload-load-error")
        : null}
      {loadState === "empty" || loadState === "content" ? (
        <>
          <div
            className="grid gap-3 rounded-xl border border-border bg-card/60 p-4 sm:p-6"
            data-testid="knowledge-upload-drop-zone"
            {...fileDrop.handlers}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              fileDrop.handlers.onDragOver(event);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              fileDrop.handlers.onDrop(event);
            }}
            data-drag-active={fileDrop.active}
          >
            <p
              data-testid="knowledge-upload-target"
              className="text-xs text-muted-foreground"
            >
              {t("knowledge.uploads.targetBase")}: {baseName || lockedBaseId}
            </p>
            <p
              className={`rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${fileDrop.active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/30 text-muted-foreground"}`}
            >
              {dropEnabled
                ? t("knowledge.uploads.dropHint")
                : pickerEnabled
                  ? t("knowledge.uploads.dropRequiresRestart")
                  : pickerDisabledMessage}
            </p>
            <Button
              type="button"
              variant="outline"
              data-testid="knowledge-upload-picker"
              disabled={!pickerEnabled || picking}
              title={pickerEnabled ? undefined : pickerDisabledMessage}
              onClick={() => {
                void handlePick();
              }}
            >
              {t(
                picking
                  ? "knowledge.uploads.pickingLabel"
                  : "knowledge.uploads.pickerLabel",
              )}
            </Button>
            {!pickerEnabled ? (
              <p className="text-xs text-muted-foreground">
                {pickerDisabledMessage}
              </p>
            ) : null}
            {renderError(pickError, "knowledge-upload-pick-error")}
          </div>
          <div className="grid gap-2">
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                setVisibleRows({});
              }}
              testId="knowledge-upload-search"
              placeholder={t("knowledge.uploads.searchPlaceholder")}
            />
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t("knowledge.uploads.filterLabel")}
              data-testid="knowledge-upload-filter"
            >
              {(
                ["all", "inProgress", "needsAttention", "completed"] as const
              ).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={filter === value ? "default" : "outline"}
                  aria-pressed={filter === value}
                  onClick={() => {
                    setFilter(value);
                    setVisibleRows({});
                  }}
                  data-testid={`knowledge-upload-filter-${value}`}
                >
                  {t(`knowledge.uploads.filters.${value}`)}
                  {` (${filterCounts[value]})`}
                </Button>
              ))}
            </div>
            {unqueryableConfirmationCount > 0 ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="knowledge-upload-query-no-remote-id"
              >
                {t("knowledge.uploads.queryNoRemoteId")}
              </p>
            ) : null}
            {reloadResult ? (
              <p
                role="status"
                data-testid="knowledge-upload-reload-result"
                className="text-xs text-muted-foreground"
              >
                {reloadResult}
              </p>
            ) : null}
          </div>
          {batches.length === 0 ? (
            <p
              data-testid="knowledge-upload-queue-empty"
              className="text-xs text-muted-foreground"
            >
              {t("knowledge.uploads.emptyList")}
            </p>
          ) : null}
          {batches.map((batch, index) => {
            const searching = search.trim().toLocaleLowerCase();
            const matches = batch.jobs.filter(matchesJob);
            const shown = visibleRows[batch.id] ?? FILE_ROWS_PER_PAGE;
            const filtered = Boolean(searching) || filter !== "all";
            const expanded =
              (filtered && matches.length > 0) ||
              (expandedBatches[batch.id] ?? index === 0);
            const pending = batch.jobs.some((job) =>
              Boolean(pendingActions[job.jobId]),
            );
            const cancellable = batch.jobs.filter(
              (job) => job.canCancel === true,
            );
            const retryable = batch.jobs.filter((job) => job.canRetry === true);
            return (
              <section
                key={batch.id}
                data-testid={`knowledge-upload-batch-${batch.id}`}
                className="grid gap-3 rounded-xl border border-border bg-card/40 p-3 sm:p-4"
              >
                <div className="grid gap-2 rounded-md border border-border p-3">
                  <strong className="text-sm">
                    {t(
                      batch.id === "legacy"
                        ? "knowledge.uploads.earlierUploads"
                        : "knowledge.uploads.batchLabel",
                    )}
                    {batch.id === "legacy" ? "" : ` ${batches.length - index}`}
                  </strong>
                  <div
                    className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    {Object.entries(batch.counts).map(([name, count]) => (
                      <span
                        key={name}
                        data-testid={`knowledge-upload-count-${name}-${batch.id}`}
                      >
                        {t(`knowledge.uploads.summary.${name}`)}: {count}
                      </span>
                    ))}
                  </div>
                  {batch.counts.completed > 0 && batch.counts.failed > 0 ? (
                    <p className="text-xs">
                      {t("knowledge.uploads.partialSuccess")}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`knowledge-upload-cancel-batch-${batch.id}`}
                      disabled={
                        !active ||
                        !probe.mutationsEnabled ||
                        !cancel ||
                        pending ||
                        !cancellable.length
                      }
                      onClick={() => {
                        void handleBatchAction(cancellable, "cancel");
                      }}
                    >
                      {t("knowledge.uploads.cancelBatchLabel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`knowledge-upload-retry-batch-${batch.id}`}
                      disabled={
                        !active ||
                        !probe.mutationsEnabled ||
                        !retry ||
                        pending ||
                        !retryable.length
                      }
                      onClick={() => {
                        void handleBatchAction(retryable, "retry");
                      }}
                    >
                      {t("knowledge.uploads.retryBatchLabel")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("knowledge.uploads.fullBatchScope")}
                  </p>
                </div>
                {matches.length === 0 ? (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid={`knowledge-upload-batch-no-matches-${batch.id}`}
                  >
                    {t("knowledge.uploads.batchNoMatches")}
                  </p>
                ) : (
                  <Collapsible
                    open={expanded}
                    onOpenChange={(open) =>
                      setExpandedBatches((previous) => ({
                        ...previous,
                        [batch.id]: open,
                      }))
                    }
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={filtered}
                        data-testid={`knowledge-upload-expand-${batch.id}`}
                      >
                        {t(
                          expanded
                            ? "knowledge.uploads.hideBatchLabel"
                            : "knowledge.uploads.showBatchLabel",
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <KnowledgeFileJobQueue
                        jobs={matches.slice(0, shown)}
                        pendingActions={pendingActions}
                        actionErrors={actionErrors}
                        canCancel={
                          active && probe.mutationsEnabled && Boolean(cancel)
                        }
                        canRetry={
                          active && probe.mutationsEnabled && Boolean(retry)
                        }
                        canDelete={active && Boolean(remove)}
                        deleteUnavailableReason={
                          !remove
                            ? t("knowledge.uploads.deleteRequiresRestart")
                            : undefined
                        }
                        onCancel={(jobId) => {
                          void handleAction(jobId, "cancel");
                        }}
                        onRetry={(jobId) => {
                          void handleAction(jobId, "retry");
                        }}
                        onDelete={(jobId) => {
                          void handleDelete(jobId);
                        }}
                      />
                      {matches.length > shown ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`knowledge-upload-show-more-${batch.id}`}
                          onClick={() =>
                            setVisibleRows((previous) => ({
                              ...previous,
                              [batch.id]: shown + FILE_ROWS_PER_PAGE,
                            }))
                          }
                        >
                          {t("knowledge.uploads.showMoreFiles")} (
                          {Math.min(FILE_ROWS_PER_PAGE, matches.length - shown)}
                          )
                        </Button>
                      ) : null}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </section>
            );
          })}
          {jobs.length > 0 && !jobs.some(matchesJob) ? (
            <div
              className="flex items-center gap-2"
              data-testid="knowledge-upload-no-matches"
            >
              <p className="text-xs text-muted-foreground">
                {t("knowledge.uploads.noMatches")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setVisibleRows({});
                }}
              >
                {t("knowledge.uploads.clearFilters")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
