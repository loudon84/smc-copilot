import { useEffect, useMemo, useState, type ReactElement } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BusinessModuleUISurface } from "@/components/common/business-module-ui-surface";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageToolbar } from "@/components/common/page-toolbar";
import {
  FilePreview,
  type KnowledgeFileProviderDeps,
} from "@/components/file-preview";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/utils/tailwind";
import { useI18n } from "../../../components/useI18n";
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
   * Test override: skip Main resolve and use a known ManagedFile id.
   * Production uses `bases.resolveDocumentPreview` via FilePreview Framework.
   */
  resolveManagedFileId?: (file: KnowledgeBaseFileSnapshot) => string | null;
  /** Optional preview probe for tests (Framework KnowledgeFileProvider). */
  loadPreview?: (fileId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type DetailLoadState = "loading" | "unavailable" | "not-found" | "content" | "error";

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
 * Document detail: left metadata/actions/permission (~30%), right FilePreview (~70%).
 * Versions / Parse open in sheets so preview stays visible.
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [parseOpen, setParseOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
  }, [probe.presentation, probe.bases, detailId, routeBaseId]);

  const fileMutationsEnabled =
    probe.mutationsEnabled &&
    knowledgeBaseActionAllowed(ownerBase?.status, "upload");

  const knowledgeDeps = useMemo((): KnowledgeFileProviderDeps => {
    return {
      resolveManagedFileId: resolveManagedFileId
        ? (source) => {
            if (!detail || detail.id !== source.id) return null;
            return resolveManagedFileId(detail);
          }
        : undefined,
      resolveDocumentPreview: probe.bases?.resolveDocumentPreview
        ? (input) => probe.bases!.resolveDocumentPreview!(input)
        : undefined,
      probeLoad: loadPreview,
    };
  }, [resolveManagedFileId, loadPreview, probe.bases, detail]);

  const refreshDetail = async (opts?: {
    reloadPreview?: boolean;
  }): Promise<void> => {
    if (!probe.bases || !detailId) return;
    const [file, listedVersions] = await Promise.all([
      probe.bases.getFile({ sourceFileId: detailId }),
      probe.bases.listFileVersions({ sourceFileId: detailId }),
    ]);
    setDetail(file);
    setVersions(listedVersions);
    if (opts?.reloadPreview) {
      setPreviewEpoch((n) => n + 1);
    }
  };

  const runFileAction = async (
    action: () => Promise<KnowledgeBaseFileSnapshot | void>,
  ): Promise<void> => {
    if (!fileMutationsEnabled || submitting) return;
    setSubmitting(true);
    try {
      await action();
      await refreshDetail({ reloadPreview: true });
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
    <BusinessModuleUISurface
      module="knowledge"
      className="flex h-full min-h-0 flex-1 flex-col"
    >
      <div
        className="flex h-full min-h-0 flex-col gap-2 overflow-hidden"
        data-testid="knowledge-document-detail-page"
        data-state={loadState}
        data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit shrink-0"
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
          <section
            className="flex min-h-0 flex-1 flex-col"
            data-testid="knowledge-document-detail"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch">
              <aside
                className={cn(
                  "flex shrink-0 flex-col border-border transition-[width] duration-200 ease-out",
                  sidebarCollapsed
                    ? "w-[50px] items-center gap-2 overflow-hidden border-r pr-0"
                    : "w-full gap-3 overflow-y-auto lg:w-[30%] lg:max-w-md lg:border-r lg:pr-4",
                )}
                data-testid="knowledge-document-sidebar"
                data-collapsed={sidebarCollapsed ? "true" : "false"}
              >
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  data-testid="knowledge-document-sidebar-toggle"
                  aria-expanded={!sidebarCollapsed}
                  aria-label={
                    sidebarCollapsed
                      ? t("knowledge.documents.sidebarExpand")
                      : t("knowledge.documents.sidebarCollapse")
                  }
                  title={
                    sidebarCollapsed
                      ? t("knowledge.documents.sidebarExpand")
                      : t("knowledge.documents.sidebarCollapse")
                  }
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </Button>
                {!sidebarCollapsed ? (
                  <>
                    <PageHeader
                      title={
                        detail.fileName || t("knowledge.documents.detailTitle")
                      }
                    >
                      <Badge>{statusLabel(t, detail.status)}</Badge>
                    </PageHeader>
                    <p
                      className="break-all text-xs text-muted-foreground"
                      data-testid="knowledge-document-detail-id"
                    >
                      {detail.id}
                    </p>
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
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-testid="knowledge-document-open-versions"
                        onClick={() => setVersionsOpen(true)}
                      >
                        {t("knowledge.documents.tabVersions")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-testid="knowledge-document-open-parse"
                        onClick={() => setParseOpen(true)}
                      >
                        {t("knowledge.documents.tabParse")}
                      </Button>
                    </div>
                    <div
                      className="grid gap-2"
                      data-testid="knowledge-document-info"
                    >
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
                          {versions.find(
                            (version) => version.id === detail.activeVersionId,
                          )?.parseStatus ??
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
                    <div className="grid gap-2 border-t border-border pt-3">
                      <Badge
                        variant="outline"
                        data-testid="knowledge-document-permission"
                        data-display-only="true"
                      >
                        {t("knowledge.documents.permissionLabel")}
                      </Badge>
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid="knowledge-document-permission-note"
                      >
                        {t("knowledge.documents.permissionDisplayOnly")}
                      </p>
                    </div>
                  </>
                ) : null}
              </aside>

              <div
                className="flex min-h-0 min-w-0 flex-1 flex-col"
                data-testid="knowledge-document-preview"
              >
                <FilePreview
                  key={`${detail.id}:${detail.activeVersionId ?? ""}:${previewEpoch}`}
                  testIdPrefix="knowledge-document-preview"
                  className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-md border border-border bg-background"
                  source={{
                    type: "knowledge",
                    id: detail.id,
                    name: detail.fileName,
                    mime: detail.mimeType ?? undefined,
                    activeVersionId: detail.activeVersionId,
                  }}
                  forceRefresh={previewEpoch > 0}
                  knowledgeDeps={knowledgeDeps}
                />
              </div>
            </div>

            <Sheet open={versionsOpen} onOpenChange={setVersionsOpen}>
              <SheetContent
                side="right"
                className="work-business-module-ui max-w-md gap-0 overflow-y-auto p-0"
                data-testid="knowledge-document-versions-drawer"
                data-business-module-ui="true"
                data-business-module="knowledge"
              >
                <SheetHeader>
                  <SheetTitle>{t("knowledge.documents.tabVersions")}</SheetTitle>
                  <SheetDescription>
                    {detail.fileName || t("knowledge.documents.detailTitle")}
                  </SheetDescription>
                </SheetHeader>
                <div className="px-6 pb-6" data-testid="knowledge-document-versions">
                  {versions.length === 0 ? (
                    <p>{t("knowledge.documents.emptyVersions")}</p>
                  ) : (
                    <ul className="grid gap-3">
                      {versions.map((version) => {
                        const active = version.id === detail.activeVersionId;
                        return (
                          <li
                            key={version.id}
                            className="flex flex-col gap-2 rounded-md border border-border p-3"
                            data-testid={`knowledge-document-version-${version.id}`}
                            data-active={active ? "true" : "false"}
                          >
                            <div>
                              {version.versionNo} ({version.id})
                              {active
                                ? ` — ${t("knowledge.documents.versionLabel")}`
                                : null}
                            </div>
                            <span
                              data-testid={`knowledge-document-version-created-${version.id}`}
                            >
                              {t("knowledge.host.createdAt")}:{" "}
                              {version.createdAt ?? ""}
                            </span>
                            <span
                              data-testid={`knowledge-document-version-uploader-${version.id}`}
                            >
                              {t("knowledge.host.uploadedBy")}:{" "}
                              {version.uploadedByMemberId ?? ""}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              data-testid={`knowledge-document-activate-${version.id}`}
                              disabled={
                                !fileMutationsEnabled || submitting || active
                              }
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
              </SheetContent>
            </Sheet>

            <Sheet open={parseOpen} onOpenChange={setParseOpen}>
              <SheetContent
                side="right"
                className="work-business-module-ui max-w-md gap-0 overflow-y-auto p-0"
                data-testid="knowledge-document-parse-drawer"
                data-business-module-ui="true"
                data-business-module="knowledge"
              >
                <SheetHeader>
                  <SheetTitle>{t("knowledge.documents.tabParse")}</SheetTitle>
                  <SheetDescription>
                    {detail.fileName || t("knowledge.documents.detailTitle")}
                  </SheetDescription>
                </SheetHeader>
                <div className="px-6 pb-6" data-testid="knowledge-document-parse-list">
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
              </SheetContent>
            </Sheet>

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
                    {t("knowledge.documents.deleteFile")}
                  </AlertDialogTitle>
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
