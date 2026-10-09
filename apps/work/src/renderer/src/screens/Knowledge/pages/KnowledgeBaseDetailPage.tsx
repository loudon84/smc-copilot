import { useEffect, useRef, useState, type ReactElement } from "react";
import { BusinessModuleUISurface } from "@/components/common/business-module-ui-surface";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import {
  isKnowledgeBuildJobTerminal,
  isKnowledgeIndexRetrievalReady,
  knowledgeBaseActionAllowed,
  type HermesKnowledgeBasesAPI,
  type KnowledgeBaseFileSnapshot,
  type KnowledgeBaseSnapshot,
  type KnowledgeBaseVisibility,
  type KnowledgeBuildJobSnapshot,
  type KnowledgeBuildProfileView,
  type KnowledgeIndexState,
} from "../../../../../shared/knowledge/knowledge-base-ipc";
import type {
  HermesKnowledgeFacadeAPI,
  HermesKnowledgeJobsAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeJobSnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import { KnowledgeLoading } from "../knowledge-page-chrome";
import { KnowledgeBaseSettingsForm } from "../features/bases/edit/KnowledgeBaseSettingsForm";
import { KnowledgeBaseDeleteConfirm } from "../features/bases/delete/KnowledgeBaseDeleteConfirm";
import { KnowledgeUploadPanel } from "../features/file-job/KnowledgeUploadPanel";
import {
  knowledgeUploadErrorCode,
  knowledgeUploadErrorKey,
} from "../features/file-job/KnowledgeFileJobQueue";

export type KnowledgeBaseDetailPageProps = {
  active?: boolean;
  params?: KnowledgeRouteParams;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onBack?: () => void;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
  bases?: HermesKnowledgeBasesAPI | null;
  pickAndUpload?: HermesKnowledgeJobsAPI["pickAndUpload"];
  listSnapshots?: () => Promise<KnowledgeJobSnapshot[]>;
  onSnapshotChanged?: (
    callback: (snapshot: KnowledgeJobSnapshot) => void,
  ) => () => void;
  cancelJob?: (input: { jobId: string }) => Promise<KnowledgeJobSnapshot>;
  retryJob?: (input: { jobId: string }) => Promise<KnowledgeJobSnapshot>;
  refreshStatus?: HermesKnowledgeJobsAPI["refreshStatus"];
  onRefreshCapability?: () => Promise<KnowledgeCapabilitySnapshot | null>;
};

type DetailLoadState =
  | "loading"
  | "unavailable"
  | "not-found"
  | "content"
  | "error";
type DetailTab = "documents" | "uploads" | "settings";

function errorCode(error: unknown): string {
  if (error instanceof Error)
    return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

function chunkReadinessLabel(
  indexes: KnowledgeIndexState[],
): "retrievalReady" | "indexedNotRetrievalReady" | "indexPending" {
  const chunk = indexes.find((item) => item.indexType === "chunk");
  if (!chunk) return "indexPending";
  if (isKnowledgeIndexRetrievalReady(chunk)) return "retrievalReady";
  if (chunk.buildStatus === "ready") return "indexedNotRetrievalReady";
  return "indexPending";
}

export function KnowledgeBaseDetailPage({
  active = true,
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
  pickAndUpload,
  listSnapshots,
  onSnapshotChanged,
  cancelJob,
  retryJob,
  refreshStatus,
  onRefreshCapability,
}: KnowledgeBaseDetailPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  } satisfies UseKnowledgeFacadeOptions);
  const detailId = params.knowledgeBaseId ?? "";
  const [loadState, setLoadState] = useState<DetailLoadState>("loading");
  const [detail, setDetail] = useState<KnowledgeBaseSnapshot | null>(null);
  const [files, setFiles] = useState<KnowledgeBaseFileSnapshot[]>([]);
  const [indexes, setIndexes] = useState<KnowledgeIndexState[]>([]);
  const [buildProfile, setBuildProfile] =
    useState<KnowledgeBuildProfileView | null>(null);
  const [buildJob, setBuildJob] = useState<KnowledgeBuildJobSnapshot | null>(
    null,
  );
  const [indexRequested, setIndexRequested] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftVisibility, setDraftVisibility] =
    useState<KnowledgeBaseVisibility>("organization");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("documents");
  const [submitting, setSubmitting] = useState(false);
  const skipNextDocumentsRefresh = useRef(true);
  const activeRef = useRef(active);
  activeRef.current = active;
  const filesScope = useRef(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const recoveringRef = useRef(false);
  const observeCompleted = useRef<(snapshots: KnowledgeJobSnapshot[]) => void>(
    () => undefined,
  );
  const readLocalJobs = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    filesScope.current += 1;
    recoveringRef.current = false;
    setRecovering(false);
    return () => {
      filesScope.current += 1;
    };
  }, [detailId, probe.bases]);

  const refreshFiles = async (): Promise<void> => {
    if (!probe.bases || !detailId) return;
    const scope = filesScope.current;
    try {
      const listed = await probe.bases.listFiles({ knowledgeBaseId: detailId });
      if (filesScope.current === scope) setFiles(listed.items);
    } catch (error) {
      if (filesScope.current === scope) throw error;
    }
  };

  const recheckCapability =
    async (): Promise<KnowledgeCapabilitySnapshot | null> => {
      if (recoveringRef.current) return probe.capability ?? null;
      const scope = filesScope.current;
      recoveringRef.current = true;
      setRecovering(true);
      try {
        await onRefreshCapability?.();
        if (scope !== filesScope.current) return null;
        const capability = await probe.refreshCapability();
        if (scope === filesScope.current)
          setReloadVersion((value) => value + 1);
        return capability;
      } catch (error) {
        if (scope === filesScope.current)
          setErrorMessage(knowledgeUploadErrorCode(error));
        return null;
      } finally {
        if (scope === filesScope.current) {
          recoveringRef.current = false;
          setRecovering(false);
        }
      }
    };

  const refreshIndexes = async (): Promise<void> => {
    if (!probe.bases || !detailId) return;
    const [listed, profile] = await Promise.all([
      probe.bases.listIndexes({ knowledgeBaseId: detailId }),
      probe.bases.getBuildProfile({ knowledgeBaseId: detailId }),
    ]);
    setIndexes(listed);
    setBuildProfile(profile);
  };

  useEffect(() => {
    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (probe.presentation === "unavailable") {
      setLoadState("unavailable");
      return;
    }
    if (!detailId || !probe.bases) {
      setLoadState("not-found");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const entity = await probe.bases!.get({ knowledgeBaseId: detailId });
        if (cancelled) return;
        setDetail(entity);
        setDraftName(entity.name);
        setDraftDescription(entity.description ?? "");
        setDraftVisibility(entity.visibility);
        const listed = await probe.bases!.listFiles({
          knowledgeBaseId: detailId,
        });
        if (cancelled) return;
        setFiles(listed.items);
        setLoadState("content");
      } catch (error) {
        if (cancelled) return;
        const code = errorCode(error);
        if (code === "KNOWLEDGE_NOT_FOUND") {
          setDetail(null);
          setLoadState("not-found");
          return;
        }
        setErrorMessage(code);
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [probe.presentation, probe.bases, detailId, reloadVersion]);

  useEffect(() => {
    if (loadState !== "content" || detailTab !== "documents" || !probe.bases) {
      return;
    }
    if (skipNextDocumentsRefresh.current) {
      skipNextDocumentsRefresh.current = false;
      return;
    }
    void refreshFiles().catch((error) => {
      setErrorMessage(errorCode(error));
    });
  }, [detailTab, loadState, probe.bases, detailId]);

  useEffect(() => {
    if (loadState !== "content" || !probe.bases || !detailId) return;
    const api = window.hermesAPI?.knowledgeJobs;
    const subscribe = onSnapshotChanged ?? api?.onSnapshotChanged?.bind(api);
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let pending = false;
    const completedAttempts = new Map<string, number>();
    const revisions = new Map<string, number>();
    const refreshCompletedFiles = async (): Promise<void> => {
      if (running) return;
      running = true;
      while (
        pending &&
        !disposed &&
        activeRef.current &&
        document.visibilityState !== "hidden"
      ) {
        pending = false;
        try {
          const listed = await probe.bases!.listFiles({
            knowledgeBaseId: detailId,
          });
          if (!disposed) setFiles(listed.items);
        } catch (error) {
          if (!disposed) {
            pending = true;
            setErrorMessage(errorCode(error));
          }
          break;
        }
      }
      running = false;
    };
    const observe = (snapshots: KnowledgeJobSnapshot[]): void => {
      if (disposed) return;
      for (const snapshot of snapshots) {
        if (snapshot.knowledgeBaseId !== detailId) continue;
        const revision = snapshot.revision ?? 0;
        if (revision < (revisions.get(snapshot.jobId) ?? -1)) continue;
        revisions.set(snapshot.jobId, revision);
        if (
          snapshot.status !== "completed" ||
          completedAttempts.get(snapshot.jobId) === snapshot.attempt
        )
          continue;
        completedAttempts.set(snapshot.jobId, snapshot.attempt);
        pending = true;
      }
      if (
        !pending ||
        !activeRef.current ||
        document.visibilityState === "hidden"
      )
        return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void refreshCompletedFiles();
      }, 100);
    };
    observeCompleted.current = observe;
    const unsubscribe = subscribe?.((snapshot) => observe([snapshot]));
    const list = listSnapshots ?? api?.listSnapshots?.bind(api);
    let localInFlight: Promise<void> | undefined;
    readLocalJobs.current = (): Promise<void> => {
      if (
        disposed ||
        !list ||
        !activeRef.current ||
        document.visibilityState === "hidden"
      )
        return Promise.resolve();
      observe([]);
      if (localInFlight) return localInFlight;
      localInFlight = Promise.resolve()
        .then(() => list())
        .then((snapshots) => {
          if (!disposed) observe(snapshots);
        })
        .catch((error) => {
          if (!disposed) setErrorMessage(errorCode(error));
        })
        .finally(() => {
          localInFlight = undefined;
        });
      return localInFlight;
    };
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [loadState, probe.bases, detailId, onSnapshotChanged, listSnapshots]);

  const previouslyActive = useRef(active);
  useEffect(() => {
    if (active && !previouslyActive.current) void readLocalJobs.current();
    previouslyActive.current = active;
    const onVisible = (): void => {
      if (active && document.visibilityState !== "hidden")
        void readLocalJobs.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active]);

  const hasActiveSource = files.some((file) => file.status === "active");
  const shouldLoadIndexes =
    hasActiveSource || indexRequested || Boolean(buildJob);

  useEffect(() => {
    if (
      loadState !== "content" ||
      !probe.bases ||
      !detailId ||
      !shouldLoadIndexes
    ) {
      return;
    }
    let cancelled = false;
    void refreshIndexes().catch((error) => {
      if (!cancelled) setErrorMessage(errorCode(error));
    });
    return () => {
      cancelled = true;
    };
  }, [loadState, probe.bases, detailId, shouldLoadIndexes]);

  useEffect(() => {
    if (!probe.bases?.onBuildChanged) return;
    const unsubscribe = probe.bases.onBuildChanged((snapshot) => {
      if (snapshot.knowledgeBaseId && snapshot.knowledgeBaseId !== detailId) {
        return;
      }
      setBuildJob(snapshot);
      if (isKnowledgeBuildJobTerminal(snapshot.status)) {
        void refreshIndexes().catch((error) => {
          setErrorMessage(errorCode(error));
        });
      }
    });
    return () => {
      unsubscribe();
      void probe.bases?.unwatchBuild?.();
    };
  }, [probe.bases, detailId]);

  const saveEnabled =
    probe.mutationsEnabled &&
    knowledgeBaseActionAllowed(detail?.status, "save");
  const deleteEnabled =
    probe.mutationsEnabled &&
    knowledgeBaseActionAllowed(detail?.status, "delete");
  const uploadEnabled =
    probe.mutationsEnabled &&
    knowledgeBaseActionAllowed(detail?.status, "upload");
  const fileMutationsEnabled = saveEnabled;

  const replaceFile = (updated: KnowledgeBaseFileSnapshot): void => {
    setFiles((prev) =>
      prev.map((file) => (file.id === updated.id ? updated : file)),
    );
  };

  const runFileAction = async (
    action: () => Promise<KnowledgeBaseFileSnapshot>,
  ): Promise<void> => {
    if (!fileMutationsEnabled || submitting) return;
    setSubmitting(true);
    try {
      replaceFile(await action());
    } catch (error) {
      setErrorMessage(errorCode(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (
    file: KnowledgeBaseFileSnapshot,
  ): Promise<void> => {
    if (!probe.bases) return;
    await runFileAction(async () => {
      const versions = await probe.bases!.listFileVersions({
        sourceFileId: file.id,
      });
      const target = [...versions]
        .filter((version) => version.id !== file.activeVersionId)
        .sort((left, right) => right.versionNo - left.versionNo)[0];
      if (!target) return file;
      return probe.bases!.activateFileVersion({
        sourceFileId: file.id,
        versionId: target.id,
      });
    });
  };

  const handleReparse = async (
    file: KnowledgeBaseFileSnapshot,
  ): Promise<void> => {
    if (!probe.bases) return;
    await runFileAction(() =>
      probe.bases!.reparseFile({ sourceFileId: file.id }),
    );
  };

  const handleArchiveToggle = async (
    file: KnowledgeBaseFileSnapshot,
  ): Promise<void> => {
    if (!probe.bases) return;
    await runFileAction(() =>
      file.archivedAt
        ? probe.bases!.unarchiveFile({ sourceFileId: file.id })
        : probe.bases!.archiveFile({ sourceFileId: file.id }),
    );
  };

  const handleSave = async (): Promise<void> => {
    if (!saveEnabled || !probe.bases || !detailId || submitting) return;
    setSubmitting(true);
    try {
      const updated = await probe.bases.update({
        knowledgeBaseId: detailId,
        name: draftName.trim() || detail?.name,
        description: draftDescription.trim() ? draftDescription.trim() : null,
        visibility: draftVisibility,
      });
      setDetail(updated);
    } catch (error) {
      setErrorMessage(errorCode(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteEnabled || !probe.bases || !detailId || submitting) return;
    setSubmitting(true);
    try {
      await probe.bases.delete({ knowledgeBaseId: detailId });
      setConfirmDelete(false);
      onBack?.();
    } catch (error) {
      setErrorMessage(errorCode(error));
      setConfirmDelete(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBuild = async (): Promise<void> => {
    if (!fileMutationsEnabled || !probe.bases || !detailId || submitting)
      return;
    setSubmitting(true);
    setIndexRequested(true);
    try {
      const snapshot = await probe.bases.startBuild({
        knowledgeBaseId: detailId,
        indexTypes: ["chunk"],
      });
      setBuildJob(snapshot);
      if (!snapshot || isKnowledgeBuildJobTerminal(snapshot.status)) {
        await refreshIndexes();
      } else {
        await probe.bases.watchBuild({ buildId: snapshot.id });
      }
    } catch (error) {
      setErrorMessage(errorCode(error));
    } finally {
      setSubmitting(false);
    }
  };

  const readinessKey = chunkReadinessLabel(indexes);

  return (
    <BusinessModuleUISurface module="knowledge">
      <div data-testid="knowledge-bases-page" data-state={loadState}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="knowledge-bases-back"
            onClick={() => onBack?.()}
          >
            {t("knowledge.host.back")}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="knowledge-base-upload"
            disabled={!uploadEnabled}
            onClick={() => {
              if (!uploadEnabled) return;
              setDetailTab("uploads");
            }}
          >
            {t("knowledge.bases.uploadAction")}
          </Button>
          {loadState === "unavailable" || loadState === "error" ? (
            <Button
              type="button"
              variant="outline"
              disabled={!active || recovering}
              data-testid="knowledge-base-recheck"
              onClick={() => {
                void recheckCapability();
              }}
            >
              {t(
                recovering
                  ? "knowledge.uploads.reconnectCheckingLabel"
                  : "knowledge.uploads.reconnectLabel",
              )}
            </Button>
          ) : null}
        </div>
        {loadState === "loading" ? (
          <KnowledgeLoading label={t("knowledge.loading")} />
        ) : null}
        {loadState === "unavailable" ? (
          <EmptyState
            title={t("knowledge.unavailableTitle")}
            description={t("knowledge.unavailableDescription")}
          />
        ) : null}
        {loadState === "not-found" ? (
          <EmptyState
            testId="knowledge-base-not-found"
            title={t("knowledge.host.notFoundTitle")}
            description={t("knowledge.host.notFoundDescription")}
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
        {loadState === "content" && detail ? (
          <section className="grid gap-3" data-testid="knowledge-base-detail">
            <PageHeader title={detail.name}>
              <Badge data-testid="knowledge-base-detail-status">
                {detail.status}
              </Badge>
            </PageHeader>
            <p data-testid="knowledge-base-detail-id">{detail.id}</p>
            <p data-testid="knowledge-base-detail-owner">
              {t("knowledge.host.owner")}: {detail.ownerMemberId ?? ""}
            </p>
            {detail.createdAt ? (
              <p data-testid="knowledge-base-detail-created">
                {t("knowledge.host.createdAt")}: {detail.createdAt}
              </p>
            ) : null}
            <Tabs
              className="flex flex-col gap-3"
              value={detailTab}
              onValueChange={(value) => {
                setDetailTab(value as DetailTab);
              }}
            >
              <TabsList>
                <TabsTrigger
                  value="documents"
                  data-testid="knowledge-section-tab-documents"
                >
                  {t("knowledge.bases.tabDocuments")}
                </TabsTrigger>
                <TabsTrigger
                  value="uploads"
                  data-testid="knowledge-section-tab-uploads"
                >
                  {t("knowledge.bases.tabUploads")}
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  data-testid="knowledge-section-tab-settings"
                >
                  {t("knowledge.bases.tabSettings")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="uploads" className="min-w-0">
                {detailTab === "uploads" ? (
                  <KnowledgeUploadPanel
                    active={active}
                    knowledgeBaseId={detailId}
                    baseName={detail.name}
                    capability={injectedCapability ?? probe.capability}
                    mode={injectedMode}
                    facade={injectedFacade}
                    bases={injectedBases}
                    pickAndUpload={pickAndUpload}
                    listSnapshots={listSnapshots}
                    onSnapshotChanged={onSnapshotChanged}
                    cancelJob={cancelJob}
                    retryJob={retryJob}
                    refreshStatus={refreshStatus}
                    onRefreshCapability={recheckCapability}
                    onSnapshotsReconciled={(snapshots) =>
                      observeCompleted.current(snapshots)
                    }
                  />
                ) : null}
              </TabsContent>
              <TabsContent forceMount value="documents">
                <p>{t("knowledge.bases.documentsNote")}</p>
                {files.length === 0 ? (
                  <p>{t("knowledge.documents.emptyList")}</p>
                ) : (
                  <Table data-testid="knowledge-base-files">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("knowledge.bases.fileName")}</TableHead>
                        <TableHead>{t("knowledge.bases.fileStatus")}</TableHead>
                        <TableHead>{t("knowledge.host.owner")}</TableHead>
                        <TableHead>{t("knowledge.host.createdAt")}</TableHead>
                        <TableHead>
                          {t("knowledge.bases.fileVersion")}
                        </TableHead>
                        <TableHead>
                          {t("knowledge.bases.fileLastError")}
                        </TableHead>
                        <TableHead>
                          {t("knowledge.bases.fileActions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files.map((file) => (
                        <TableRow
                          key={file.id}
                          data-testid={`knowledge-base-file-${file.id}`}
                        >
                          <TableCell>{file.fileName}</TableCell>
                          <TableCell>{file.status}</TableCell>
                          <TableCell
                            data-testid={`knowledge-base-file-owner-${file.id}`}
                          >
                            {file.ownerMemberId ?? ""}
                          </TableCell>
                          <TableCell
                            data-testid={`knowledge-base-file-created-${file.id}`}
                          >
                            {file.createdAt ?? ""}
                          </TableCell>
                          <TableCell
                            data-testid={`knowledge-base-file-version-${file.id}`}
                          >
                            {file.activeVersionId ?? ""}
                          </TableCell>
                          <TableCell>{file.lastError ?? ""}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                data-testid={`knowledge-base-file-open-${file.id}`}
                                onClick={() =>
                                  onNavigate?.({
                                    page: "documents",
                                    params: {
                                      knowledgeBaseId: detailId,
                                      documentId: file.id,
                                    },
                                  })
                                }
                              >
                                {t("knowledge.host.open")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                data-testid={`knowledge-base-file-activate-${file.id}`}
                                disabled={!fileMutationsEnabled || submitting}
                                onClick={() => {
                                  void handleActivate(file);
                                }}
                              >
                                {t("knowledge.bases.activateVersion")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                data-testid={`knowledge-base-file-reparse-${file.id}`}
                                disabled={!fileMutationsEnabled || submitting}
                                onClick={() => {
                                  void handleReparse(file);
                                }}
                              >
                                {t("knowledge.bases.reparseFile")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                data-testid={`knowledge-base-file-archive-${file.id}`}
                                disabled={!fileMutationsEnabled || submitting}
                                onClick={() => {
                                  void handleArchiveToggle(file);
                                }}
                              >
                                {file.archivedAt
                                  ? t("knowledge.bases.unarchiveFile")
                                  : t("knowledge.bases.archiveFile")}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div
                  className="mt-4 grid gap-2"
                  data-testid="knowledge-base-indexes"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">
                      {t("knowledge.bases.indexTitle")}
                    </h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="knowledge-base-build"
                      disabled={!fileMutationsEnabled || submitting}
                      onClick={() => {
                        void handleBuild();
                      }}
                    >
                      {t("knowledge.bases.buildAction")}
                    </Button>
                  </div>
                  {buildProfile ? (
                    <p data-testid="knowledge-base-build-profile">
                      {t("knowledge.bases.buildProfile")}:{" "}
                      {buildProfile.profileName}
                    </p>
                  ) : null}
                  {buildJob ? (
                    <p data-testid="knowledge-base-build-status">
                      {t("knowledge.bases.buildStatus")}: {buildJob.status}{" "}
                      {buildJob.progress}%
                    </p>
                  ) : null}
                  <p
                    data-testid="knowledge-base-retrieval-ready"
                    data-ready={
                      readinessKey === "retrievalReady" ? "true" : "false"
                    }
                  >
                    {t(`knowledge.bases.${readinessKey}`)}
                  </p>
                  {indexes.map((index) => (
                    <p
                      key={index.indexType}
                      data-testid={`knowledge-base-index-${index.indexType}`}
                    >
                      {index.indexType}: {t("knowledge.bases.indexBuildStatus")}{" "}
                      {index.buildStatus};{" "}
                      {t("knowledge.bases.indexRetrievalStatus")}{" "}
                      {index.retrievalStatus}
                    </p>
                  ))}
                </div>
              </TabsContent>
              <TabsContent forceMount value="settings">
                <KnowledgeBaseSettingsForm
                  name={draftName}
                  description={draftDescription}
                  visibility={draftVisibility}
                  saveEnabled={saveEnabled}
                  submitting={submitting}
                  onNameChange={setDraftName}
                  onDescriptionChange={setDraftDescription}
                  onVisibilityChange={setDraftVisibility}
                  onSave={() => {
                    void handleSave();
                  }}
                  editLabel={t("knowledge.host.edit")}
                  descriptionLabel={t("knowledge.bases.descriptionLabel")}
                  visibilityLabel={t("knowledge.host.visibility")}
                  saveLabel={t("knowledge.host.save")}
                  privateLabel={t("knowledge.host.private")}
                  departmentLabel={t("knowledge.host.department")}
                  organizationLabel={t("knowledge.host.organization")}
                />
                <div className="mt-6 grid gap-2">
                  <h3 className="text-sm font-medium">
                    {t("knowledge.bases.dangerZone")}
                  </h3>
                  <Button
                    type="button"
                    variant="destructive"
                    data-testid="knowledge-base-delete"
                    disabled={!deleteEnabled || submitting}
                    title={
                      deleteEnabled
                        ? undefined
                        : t("knowledge.bases.mutateDisabled")
                    }
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t("knowledge.bases.deleteLabel")}
                  </Button>
                  {!probe.mutationsEnabled ? (
                    <p>{t("knowledge.bases.mutateDisabled")}</p>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>

            {errorMessage ? (
              <div className="text-xs">
                <p role="alert">
                  {t(
                    `knowledge.uploads.${knowledgeUploadErrorKey(errorMessage)}`,
                  )}
                </p>
                <details>
                  <summary>{t("knowledge.uploads.detailsLabel")}</summary>
                  {t("knowledge.uploads.errorCodeLabel")}: {errorMessage}
                </details>
              </div>
            ) : null}

            <AlertDialog
              open={confirmDelete}
              onOpenChange={(open) => {
                if (submitting && !open) return;
                setConfirmDelete(open);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("knowledge.bases.deleteLabel")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("knowledge.bases.mutateDisabled")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <KnowledgeBaseDeleteConfirm
                  submitting={submitting}
                  onCancel={() => {
                    if (!submitting) setConfirmDelete(false);
                  }}
                  onConfirm={() => {
                    void handleDelete();
                  }}
                  cancelLabel={t("knowledge.host.cancel")}
                  confirmLabel={t("knowledge.host.confirm")}
                />
              </AlertDialogContent>
            </AlertDialog>
          </section>
        ) : null}
      </div>
    </BusinessModuleUISurface>
  );
}

export default KnowledgeBaseDetailPage;
