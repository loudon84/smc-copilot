import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  FilePreview,
  type KnowledgeFileProviderDeps,
} from "@/components/file-preview";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  knowledgeBaseActionAllowed,
  type HermesKnowledgeBasesAPI,
  type KnowledgeBaseFileSnapshot,
  type KnowledgeBaseSnapshot,
  type KnowledgeFileVersionSnapshot,
  type KnowledgeSourceFileStatus,
} from "../../../src/shared/knowledge/knowledge-base-ipc";
import { HybridSplit } from "./HybridSplit";
import { KnowledgeChunkPanel } from "./KnowledgeChunkPanel";
import { useKnowledgeChunkPanel } from "./useKnowledgeChunkPanel";

const DEFAULT_SOURCE_PERCENT = 42;

export type DocumentDetailProps = {
  t: (key: string) => string;
  documentId: string;
  knowledgeBaseId?: string;
  bases: HermesKnowledgeBasesAPI | null;
  presentation: "loading" | "unavailable" | "ready" | string;
  mutationsEnabled: boolean;
  onNavigate?: (target: {
    page: string;
    params?: { knowledgeBaseId?: string; documentId?: string };
  }) => void;
  onBack?: () => void;
  resolveManagedFileId?: (file: KnowledgeBaseFileSnapshot) => string | null;
  loadPreview?: (
    fileId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type DetailLoadState =
  | "loading"
  | "unavailable"
  | "not-found"
  | "content"
  | "error";

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

const STACK_MQ = 960;

/**
 * DocumentDetail Hybrid workspace — Source FilePreview + Chunk panel.
 * Info / Versions / Parse live in drawers; no Build/retrieval UI.
 */
export function DocumentDetail({
  t,
  documentId,
  knowledgeBaseId = "",
  bases,
  presentation,
  mutationsEnabled,
  onNavigate,
  onBack,
  resolveManagedFileId,
  loadPreview,
}: DocumentDetailProps): ReactElement {
  const detailId = documentId;
  const routeBaseId = knowledgeBaseId;

  const [loadState, setLoadState] = useState<DetailLoadState>("loading");
  const [detail, setDetail] = useState<KnowledgeBaseFileSnapshot | null>(null);
  const [versions, setVersions] = useState<KnowledgeFileVersionSnapshot[]>([]);
  const [ownerBase, setOwnerBase] = useState<KnowledgeBaseSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [parseOpen, setParseOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sourcePercent, setSourcePercent] = useState(DEFAULT_SOURCE_PERCENT);
  const [stacked, setStacked] = useState(
    () =>
      typeof window !== "undefined" ? window.innerWidth < STACK_MQ : false,
  );
  const [syncEpoch, setSyncEpoch] = useState(0);
  const [reparsePending, setReparsePending] = useState(false);

  useEffect(() => {
    const onResize = (): void => {
      setStacked(window.innerWidth < STACK_MQ);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Reopen resets split; no cross-session persistence (v2.1 lock).
  useEffect(() => {
    setSourcePercent(DEFAULT_SOURCE_PERCENT);
  }, [detailId]);

  useEffect(() => {
    if (presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (presentation === "unavailable") {
      setLoadState("unavailable");
      return;
    }
    if (!detailId || !bases) {
      setDetail(null);
      setLoadState("not-found");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const file = await bases.getFile({ sourceFileId: detailId });
        if (cancelled) return;
        const ownerId = routeBaseId || file.knowledgeBaseId;
        const [listedVersions, owner] = await Promise.all([
          bases.listFileVersions({ sourceFileId: file.id }),
          ownerId
            ? bases.get({ knowledgeBaseId: ownerId }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setDetail(file);
        setVersions(listedVersions);
        setOwnerBase(owner);
        setLoadState("content");
        setReparsePending(false);
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
  }, [presentation, bases, detailId, routeBaseId]);

  const fileMutationsEnabled =
    mutationsEnabled &&
    knowledgeBaseActionAllowed(ownerBase?.status, "upload");

  const knowledgeDeps = useMemo((): KnowledgeFileProviderDeps => {
    return {
      resolveManagedFileId: resolveManagedFileId
        ? (source) => {
            if (!detail || detail.id !== source.id) return null;
            return resolveManagedFileId(detail);
          }
        : undefined,
      resolveDocumentPreview: bases?.resolveDocumentPreview
        ? (input) => bases.resolveDocumentPreview!(input)
        : undefined,
      probeLoad: loadPreview,
    };
  }, [resolveManagedFileId, loadPreview, bases, detail]);

  const refreshDetail = async (opts?: {
    reloadPreview?: boolean;
    afterReparse?: boolean;
  }): Promise<void> => {
    if (!bases || !detailId) return;
    const [file, listedVersions] = await Promise.all([
      bases.getFile({ sourceFileId: detailId }),
      bases.listFileVersions({ sourceFileId: detailId }),
    ]);
    setDetail(file);
    setVersions(listedVersions);
    if (opts?.reloadPreview) {
      setPreviewEpoch((n) => n + 1);
    }
    if (opts?.afterReparse) {
      setReparsePending(true);
    } else {
      setReparsePending(false);
    }
    setSyncEpoch((n) => n + 1);
  };

  const runFileAction = async (
    action: () => Promise<KnowledgeBaseFileSnapshot | void>,
    opts?: { afterReparse?: boolean },
  ): Promise<void> => {
    if (!fileMutationsEnabled || submitting) return;
    setSubmitting(true);
    try {
      await action();
      await refreshDetail({
        reloadPreview: true,
        afterReparse: opts?.afterReparse,
      });
    } catch (error) {
      setErrorMessage(errorCode(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (versionId: string): Promise<void> => {
    if (!bases || !detail) return;
    await runFileAction(() =>
      bases.activateFileVersion({
        sourceFileId: detail.id,
        versionId,
      }),
    );
  };

  const handleReparse = async (): Promise<void> => {
    if (!bases || !detail) return;
    await runFileAction(
      () => bases.reparseFile({ sourceFileId: detail.id }),
      { afterReparse: true },
    );
  };

  const handleArchiveToggle = async (): Promise<void> => {
    if (!bases || !detail) return;
    await runFileAction(() =>
      detail.archivedAt
        ? bases.unarchiveFile({ sourceFileId: detail.id })
        : bases.archiveFile({ sourceFileId: detail.id }),
    );
  };

  const handleDelete = async (): Promise<void> => {
    if (!fileMutationsEnabled || !bases || !detail || submitting) return;
    setSubmitting(true);
    try {
      await bases.deleteFile({ sourceFileId: detail.id });
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

  const chunkPanel = useKnowledgeChunkPanel({
    bases,
    sourceFileId: detail?.id ?? detailId,
    activeVersionId: detail?.activeVersionId ?? null,
    versions,
    mutationsEnabled: fileMutationsEnabled,
    syncEpoch,
    reparsePending,
  });

  // Clear reparsePending when parse leaves pending/parsing
  useEffect(() => {
    if (!reparsePending || !detail?.activeVersionId) return;
    const status = versions.find(
      (v) => v.id === detail.activeVersionId,
    )?.parseStatus;
    if (status && status !== "pending" && status !== "parsing") {
      setReparsePending(false);
    }
  }, [reparsePending, detail?.activeVersionId, versions]);

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2 overflow-hidden"
      data-testid="knowledge-document-detail-page"
      data-state={loadState}
    >
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="knowledge-documents-back"
          onClick={() => onBack?.()}
        >
          {t("knowledge.host.back")}
        </Button>
        {loadState === "content" && detail ? (
          <>
            <PageHeader
              title={detail.fileName || t("knowledge.documents.detailTitle")}
            >
              <Badge>{statusLabel(t, detail.status)}</Badge>
            </PageHeader>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="knowledge-document-open-info"
              onClick={() => setInfoOpen(true)}
            >
              {t("knowledge.documents.tabInfo")}
            </Button>
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
            <div className="relative">
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="knowledge-document-more"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((open) => !open)}
              >
                {t("knowledge.documents.moreActions")}
              </Button>
              {moreOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 min-w-40 rounded-md border border-border bg-popover p-1 shadow-md"
                  data-testid="knowledge-document-more-menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                    data-testid="knowledge-document-reparse"
                    disabled={!fileMutationsEnabled || submitting}
                    onClick={() => {
                      setMoreOpen(false);
                      void handleReparse();
                    }}
                  >
                    {t("knowledge.bases.reparseFile")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                    data-testid="knowledge-document-archive"
                    disabled={!fileMutationsEnabled || submitting}
                    onClick={() => {
                      setMoreOpen(false);
                      void handleArchiveToggle();
                    }}
                  >
                    {detail.archivedAt
                      ? t("knowledge.bases.unarchiveFile")
                      : t("knowledge.bases.archiveFile")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full rounded-md px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
                    data-testid="knowledge-document-delete"
                    disabled={!fileMutationsEnabled || submitting}
                    onClick={() => {
                      setMoreOpen(false);
                      setConfirmDelete(true);
                    }}
                  >
                    {t("knowledge.documents.deleteFile")}
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {loadState === "loading" ? (
        <p data-testid="knowledge-loading">{t("knowledge.loading")}</p>
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
          <HybridSplit
            stacked={stacked}
            sourcePercent={sourcePercent}
            onSourcePercentChange={setSourcePercent}
            sourcePane={
              <div
                className="flex h-full min-h-0 flex-col"
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
            }
            chunkPane={
              <KnowledgeChunkPanel
                t={t}
                panel={chunkPanel}
                mutationsEnabled={fileMutationsEnabled}
              />
            }
          />

          <Sheet open={infoOpen} onOpenChange={setInfoOpen}>
            <SheetContent
              side="right"
              className="work-business-module-ui max-w-md gap-0 overflow-y-auto p-0"
              data-testid="knowledge-document-info-drawer"
            >
              <SheetHeader>
                <SheetTitle>{t("knowledge.documents.tabInfo")}</SheetTitle>
                <SheetDescription>
                  {detail.fileName || t("knowledge.documents.detailTitle")}
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-2 px-6 pb-6" data-testid="knowledge-document-info">
                <p data-testid="knowledge-document-detail-id">{detail.id}</p>
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
                    {versions.find((v) => v.id === detail.activeVersionId)
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
            </SheetContent>
          </Sheet>

          <Sheet open={versionsOpen} onOpenChange={setVersionsOpen}>
            <SheetContent
              side="right"
              className="work-business-module-ui max-w-md gap-0 overflow-y-auto p-0"
              data-testid="knowledge-document-versions-drawer"
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
  );
}
