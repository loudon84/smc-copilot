import { useEffect, useState, type ReactElement } from "react";
import { BusinessModuleUISurface } from "@/components/common/business-module-ui-surface";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageToolbar } from "@/components/common/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "../../../components/useI18n";
import { FilePreviewRouter } from "../../../components/files/preview/FilePreviewRouter";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import {
  knowledgeBaseActionAllowed,
  type HermesKnowledgeBasesAPI,
  type KnowledgeBaseFileSnapshot,
  type KnowledgeBaseSnapshot,
  type KnowledgeFileVersionSnapshot,
  type KnowledgeSourceFileStatus,
} from "../../../../../shared/knowledge/knowledge-base-ipc";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import { KnowledgeLoading } from "../knowledge-page-chrome";
import type { FilePreviewState } from "../../../hooks/files/useFilePreview";

export type KnowledgeDocumentDetailPageProps = {
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
  /**
   * Optional ManagedFile id resolver. Product default returns null so preview
   * stays gracefully unavailable unless a ManagedFile is known.
   */
  resolveManagedFileId?: (file: KnowledgeBaseFileSnapshot) => string | null;
  /** Optional preview loader for tests / File Platform bridge. */
  loadPreview?: (fileId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type DetailLoadState = "loading" | "unavailable" | "not-found" | "content" | "error";

type PreviewState =
  | { status: "idle" }
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "ready"; fileId: string; filePreview?: FilePreviewState }
  | { status: "error"; message: string };

/** Reserved tabs for later file-management entries (update / translate). */
type DocDetailTab = "preview" | "info" | "versions" | "parse" | "permission";

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message.split(/\s/)[0] ?? error.message;
  return "KNOWLEDGE_UNAVAILABLE";
}

function isNotFound(error: unknown): boolean {
  return errorCode(error) === "KNOWLEDGE_NOT_FOUND";
}

function statusLabel(
  t: (key: string) => string,
  status: KnowledgeSourceFileStatus,
): string {
  switch (status) {
    case "pending":
      return t("knowledge.documents.statusPending");
    case "active":
      return t("knowledge.documents.statusActive");
    case "updating":
      return t("knowledge.documents.statusUpdating");
    case "error":
      return t("knowledge.documents.statusError");
    case "deleting":
      return t("knowledge.documents.statusDeleting");
    default:
      return status;
  }
}

/**
 * Document detail over Base file IPC. Preview stays ManagedFile-only until
 * the unified multi-format preview is wired. Permission copy is display-only.
 */
export function KnowledgeDocumentDetailPage({
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
  resolveManagedFileId,
  loadPreview,
}: KnowledgeDocumentDetailPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  } satisfies UseKnowledgeFacadeOptions);
  const detailId = params.documentId ?? "";
  const routeBaseId = params.knowledgeBaseId ?? "";
  const [loadState, setLoadState] = useState<DetailLoadState>("loading");
  const [detail, setDetail] = useState<KnowledgeBaseFileSnapshot | null>(null);
  const [versions, setVersions] = useState<KnowledgeFileVersionSnapshot[]>([]);
  const [ownerBase, setOwnerBase] = useState<KnowledgeBaseSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [detailTab, setDetailTab] = useState<DocDetailTab>("preview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadPreviewFor = async (
    file: KnowledgeBaseFileSnapshot,
    cancelled: () => boolean,
  ): Promise<void> => {
    const managedFileId = resolveManagedFileId?.(file) ?? null;
    if (!managedFileId) {
      setPreview({ status: "unavailable" });
      return;
    }
    setPreview({ status: "loading" });
    try {
      if (loadPreview) {
        const result = await loadPreview(managedFileId);
        if (cancelled()) return;
        if (result.ok) {
          setPreview({ status: "ready", fileId: managedFileId });
        } else {
          setPreview({ status: "error", message: result.error });
        }
        return;
      }
      const filesApi = window.hermesAPI?.files;
      if (!filesApi?.getPreview) {
        if (!cancelled()) setPreview({ status: "unavailable" });
        return;
      }
      const result = await filesApi.getPreview(undefined, managedFileId);
      if (cancelled()) return;
      if (result && "error" in result) {
        setPreview({ status: "error", message: result.error.message });
        return;
      }
      setPreview({
        status: "ready",
        fileId: managedFileId,
        filePreview: {
          open: true,
          fileId: managedFileId,
          loading: false,
          descriptor: result,
        },
      });
    } catch (error) {
      if (cancelled()) return;
      setPreview({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : t("knowledge.documents.previewError"),
      });
    }
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
      setDetail(null);
      setLoadState("not-found");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const file = await probe.bases!.getFile({ sourceFileId: detailId });
        if (cancelled) return;
        const ownerId = routeBaseId || file.knowledgeBaseId;
        const [listedVersions, owner] = await Promise.all([
          probe.bases!.listFileVersions({ sourceFileId: file.id }),
          ownerId
            ? probe.bases!.get({ knowledgeBaseId: ownerId }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setDetail(file);
        setVersions(listedVersions);
        setOwnerBase(owner);
        setLoadState("content");
        await loadPreviewFor(file, () => cancelled);
      } catch (error) {
        if (cancelled) return;
        if (isNotFound(error)) {
          setDetail(null);
          setLoadState("not-found");
          return;
        }
        setErrorMessage(errorCode(error));
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    probe.presentation,
    probe.bases,
    detailId,
    routeBaseId,
    resolveManagedFileId,
    loadPreview,
  ]);

  const fileMutationsEnabled =
    probe.mutationsEnabled &&
    knowledgeBaseActionAllowed(ownerBase?.status, "upload");

  const refreshDetail = async (): Promise<void> => {
    if (!probe.bases || !detailId) return;
    const [file, listedVersions] = await Promise.all([
      probe.bases.getFile({ sourceFileId: detailId }),
      probe.bases.listFileVersions({ sourceFileId: detailId }),
    ]);
    setDetail(file);
    setVersions(listedVersions);
  };

  const runFileAction = async (
    action: () => Promise<KnowledgeBaseFileSnapshot | void>,
  ): Promise<void> => {
    if (!fileMutationsEnabled || submitting) return;
    setSubmitting(true);
    try {
      await action();
      await refreshDetail();
    } catch (error) {
      setErrorMessage(errorCode(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (versionId: string): Promise<void> => {
    if (!probe.bases || !detail) return;
    await runFileAction(() =>
      probe.bases!.activateFileVersion({
        sourceFileId: detail.id,
        versionId,
      }),
    );
  };

  const handleReparse = async (): Promise<void> => {
    if (!probe.bases || !detail) return;
    await runFileAction(() =>
      probe.bases!.reparseFile({ sourceFileId: detail.id }),
    );
  };

  const handleArchiveToggle = async (): Promise<void> => {
    if (!probe.bases || !detail) return;
    await runFileAction(() =>
      detail.archivedAt
        ? probe.bases!.unarchiveFile({ sourceFileId: detail.id })
        : probe.bases!.archiveFile({ sourceFileId: detail.id }),
    );
  };

  const handleDelete = async (): Promise<void> => {
    if (!fileMutationsEnabled || !probe.bases || !detail || submitting) return;
    setSubmitting(true);
    try {
      await probe.bases.deleteFile({ sourceFileId: detail.id });
      setConfirmDelete(false);
      if (onNavigate) {
        onNavigate({
          page: "documents",
          params: routeBaseId ? { knowledgeBaseId: routeBaseId } : {},
        });
      } else {
        onBack?.();
      }
    } catch (error) {
      setErrorMessage(errorCode(error));
      setLoadState("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BusinessModuleUISurface module="knowledge">
      <div data-testid="knowledge-document-detail-page" data-state={loadState}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="knowledge-documents-back"
          onClick={() => onBack?.()}
        >
          {t("knowledge.host.back")}
        </Button>
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
            testId="knowledge-document-not-found"
            title={t("knowledge.host.notFoundTitle")}
            description={t("knowledge.host.notFoundDescription")}
          />
        ) : null}
        {loadState === "error" ? (
          <EmptyState
            title={t("knowledge.host.errorTitle")}
            description={errorMessage}
          />
        ) : null}
        {loadState === "content" && detail ? (
          <section className="grid gap-3" data-testid="knowledge-document-detail">
            <PageHeader title={detail.fileName || t("knowledge.documents.detailTitle")}>
              <Badge>{statusLabel(t, detail.status)}</Badge>
            </PageHeader>
            <p data-testid="knowledge-document-detail-id">{detail.id}</p>
            <PageToolbar>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="knowledge-document-reparse"
                disabled={!fileMutationsEnabled || submitting}
                onClick={() => {
                  void handleReparse();
                }}
              >
                {t("knowledge.bases.reparseFile")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="knowledge-document-archive"
                disabled={!fileMutationsEnabled || submitting}
                onClick={() => {
                  void handleArchiveToggle();
                }}
              >
                {detail.archivedAt
                  ? t("knowledge.bases.unarchiveFile")
                  : t("knowledge.bases.archiveFile")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                data-testid="knowledge-document-delete"
                disabled={!fileMutationsEnabled || submitting}
                onClick={() => setConfirmDelete(true)}
              >
                {t("knowledge.documents.deleteFile")}
              </Button>
            </PageToolbar>
            <Tabs
              className="flex flex-col gap-3"
              value={detailTab}
              onValueChange={(value) => setDetailTab(value as DocDetailTab)}
            >
              <TabsList>
                <TabsTrigger value="preview" data-testid="knowledge-section-tab-preview">
                  {t("knowledge.documents.tabPreview")}
                </TabsTrigger>
                <TabsTrigger value="info" data-testid="knowledge-section-tab-info">
                  {t("knowledge.documents.tabInfo")}
                </TabsTrigger>
                <TabsTrigger value="versions" data-testid="knowledge-section-tab-versions">
                  {t("knowledge.documents.tabVersions")}
                </TabsTrigger>
                <TabsTrigger value="parse" data-testid="knowledge-section-tab-parse">
                  {t("knowledge.documents.tabParse")}
                </TabsTrigger>
                <TabsTrigger value="permission" data-testid="knowledge-section-tab-permission">
                  {t("knowledge.documents.tabPermission")}
                </TabsTrigger>
              </TabsList>
              <TabsContent forceMount value="preview">
                <section data-testid="knowledge-document-preview">
                  <h3 className="text-sm font-medium">
                    {t("knowledge.documents.previewTitle")}
                  </h3>
                  {preview.status === "unavailable" || preview.status === "idle" ? (
                    <p data-testid="knowledge-document-preview-unavailable">
                      {t("knowledge.documents.previewUnavailable")}
                    </p>
                  ) : null}
                  {preview.status === "loading" ? (
                    <p data-testid="knowledge-document-preview-loading">
                      {t("knowledge.loading")}
                    </p>
                  ) : null}
                  {preview.status === "ready" ? (
                    <div data-testid="knowledge-document-preview-ready">
                      {preview.filePreview?.descriptor ? (
                        <FilePreviewRouter state={preview.filePreview} />
                      ) : (
                        <p>ManagedFile {preview.fileId}</p>
                      )}
                    </div>
                  ) : null}
                  {preview.status === "error" ? (
                    <p data-testid="knowledge-document-preview-error">
                      {t("knowledge.documents.previewError")}: {preview.message}
                    </p>
                  ) : null}
                </section>
              </TabsContent>
              <TabsContent forceMount value="info">
                <div className="grid gap-2" data-testid="knowledge-document-info">
                  <p>
                    {t("knowledge.host.owner")}:{" "}
                    <span data-testid="knowledge-document-owner">
                      {detail.ownerMemberId ?? ""}
                    </span>
                  </p>
                  {detail.createdAt ? (
                    <p>
                      {t("knowledge.host.createdAt")}:{" "}
                      <span data-testid="knowledge-document-created">
                        {detail.createdAt}
                      </span>
                    </p>
                  ) : null}
                  <p>
                    {t("knowledge.documents.filterStatus")}:{" "}
                    <span data-testid="knowledge-document-status">
                      {statusLabel(t, detail.status)}
                    </span>
                  </p>
                  <p>
                    {t("knowledge.documents.versionLabel")}:{" "}
                    <span data-testid="knowledge-document-version">
                      {detail.activeVersionId ?? ""}
                    </span>
                  </p>
                  <p>
                    {t("knowledge.documents.parseLabel")}:{" "}
                    <span data-testid="knowledge-document-parse">
                      {versions.find((version) => version.id === detail.activeVersionId)
                        ?.parseStatus ??
                        versions[0]?.parseStatus ??
                        ""}
                    </span>
                  </p>
                  <p>
                    {t("knowledge.documents.mimeLabel")}:{" "}
                    <span data-testid="knowledge-document-mime">
                      {detail.mimeType ?? ""}
                    </span>
                  </p>
                  <p>
                    {t("knowledge.documents.archivedLabel")}:{" "}
                    <span data-testid="knowledge-document-archived">
                      {detail.archivedAt ?? ""}
                    </span>
                  </p>
                  <p>
                    {t("knowledge.documents.baseLabel")}:{" "}
                    <span data-testid="knowledge-document-base">
                      {ownerBase?.name ?? detail.knowledgeBaseId}
                    </span>
                  </p>
                  <p>
                    {t("knowledge.documents.lastErrorLabel")}:{" "}
                    <span data-testid="knowledge-document-last-error">
                      {detail.lastError ?? ""}
                    </span>
                  </p>
                </div>
              </TabsContent>
              <TabsContent forceMount value="versions">
                <div data-testid="knowledge-document-versions">
                  {versions.length === 0 ? (
                    <p>{t("knowledge.documents.emptyVersions")}</p>
                  ) : (
                    <ul className="grid gap-2">
                      {versions.map((version) => {
                        const active = version.id === detail.activeVersionId;
                        return (
                          <li
                            key={version.id}
                            className="flex flex-wrap items-center gap-2"
                            data-testid={`knowledge-document-version-${version.id}`}
                            data-active={active ? "true" : "false"}
                          >
                            {version.versionNo} ({version.id})
                            {active ? ` — ${t("knowledge.documents.versionLabel")}` : null}
                            <span data-testid={`knowledge-document-version-created-${version.id}`}>
                              {t("knowledge.host.createdAt")}: {version.createdAt ?? ""}
                            </span>
                            <span data-testid={`knowledge-document-version-uploader-${version.id}`}>
                              {t("knowledge.host.uploadedBy")}: {version.uploadedByMemberId ?? ""}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              data-testid={`knowledge-document-activate-${version.id}`}
                              disabled={!fileMutationsEnabled || submitting || active}
                              onClick={() => {
                                void handleActivate(version.id);
                              }}
                            >
                              {t("knowledge.bases.activateVersion")}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </TabsContent>
              <TabsContent forceMount value="parse">
                <div data-testid="knowledge-document-parse-list">
                  {versions.length === 0 ? (
                    <p>{t("knowledge.documents.emptyParse")}</p>
                  ) : (
                    <ul className="grid gap-2">
                      {versions.map((version) => (
                        <li
                          key={version.id}
                          data-testid={`knowledge-document-parse-${version.id}`}
                        >
                          {version.id}: {version.parseStatus}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>
              <TabsContent forceMount value="permission">
                <Badge
                  variant="outline"
                  data-testid="knowledge-document-permission"
                  data-display-only="true"
                >
                  {t("knowledge.documents.permissionLabel")}
                </Badge>
                <p data-testid="knowledge-document-permission-note">
                  {t("knowledge.documents.permissionDisplayOnly")}
                </p>
              </TabsContent>
            </Tabs>
            <AlertDialog
              open={confirmDelete}
              onOpenChange={(open) => {
                if (submitting && !open) return;
                setConfirmDelete(open);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("knowledge.documents.deleteFile")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("knowledge.documents.deleteFileConfirm")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t("knowledge.host.cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    data-testid="knowledge-document-delete-confirm"
                    disabled={submitting}
                    onClick={() => {
                      void handleDelete();
                    }}
                  >
                    {t("knowledge.host.confirm")}
                  </Button>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          </section>
        ) : null}
      </div>
    </BusinessModuleUISurface>
  );
}

export default KnowledgeDocumentDetailPage;
