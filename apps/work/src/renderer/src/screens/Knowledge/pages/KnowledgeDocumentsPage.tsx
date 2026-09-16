import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useI18n } from "../../../components/useI18n";
import { FilePreviewRouter } from "../../../components/files/preview/FilePreviewRouter";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeFacadeEntitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import {
  KnowledgeEmptyState,
  KnowledgeLoading,
  KnowledgeSearchInput,
  KnowledgeSectionTabs,
  KnowledgeToolbar,
} from "../knowledge-page-chrome";
import type { FilePreviewState } from "../../../hooks/files/useFilePreview";

export type KnowledgeDocumentsPageProps = {
  params?: KnowledgeRouteParams;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onBack?: () => void;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
  /**
   * Optional ManagedFile id resolver. Product default returns null so preview
   * stays gracefully unavailable unless a ManagedFile is known.
   */
  resolveManagedFileId?: (
    entity: KnowledgeFacadeEntitySnapshot,
  ) => string | null;
  /** Optional preview loader for tests / File Platform bridge. */
  loadPreview?: (fileId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type DocsLoadState =
  | "loading"
  | "unavailable"
  | "empty"
  | "content"
  | "not-found"
  | "error";

type PreviewState =
  | { status: "idle" }
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "ready"; fileId: string; filePreview?: FilePreviewState }
  | { status: "error"; message: string };

type DocDetailTab = "preview" | "info" | "versions" | "parse" | "permission";

/**
 * Knowledge Documents list/detail with display-only permission and Work preview
 * when a ManagedFile id is available.
 */
export function KnowledgeDocumentsPage({
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  resolveManagedFileId,
  loadPreview,
}: KnowledgeDocumentsPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  } satisfies UseKnowledgeFacadeOptions);
  const detailId = params.documentId;
  const [loadState, setLoadState] = useState<DocsLoadState>("loading");
  const [items, setItems] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [detail, setDetail] = useState<KnowledgeFacadeEntitySnapshot | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [errorMessage, setErrorMessage] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [detailTab, setDetailTab] = useState<DocDetailTab>("preview");

  useEffect(() => {
    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (probe.presentation === "unavailable") {
      setLoadState("unavailable");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        if (detailId) {
          if (!probe.facade || probe.mode?.dataMode !== "mock") {
            if (!cancelled) setLoadState("not-found");
            return;
          }
          const entity = await probe.facade.getEntity({
            kind: "document",
            entityId: detailId,
          });
          if (cancelled) return;
          if (!entity) {
            setDetail(null);
            setLoadState("not-found");
            return;
          }
          setDetail(entity);
          setLoadState("content");

          const managedFileId = resolveManagedFileId?.(entity) ?? null;
          if (!managedFileId) {
            setPreview({ status: "unavailable" });
            return;
          }
          setPreview({ status: "loading" });
          try {
            if (loadPreview) {
              const result = await loadPreview(managedFileId);
              if (cancelled) return;
              if (result.ok) {
                setPreview({ status: "ready", fileId: managedFileId });
              } else {
                setPreview({ status: "error", message: result.error });
              }
            } else {
              const filesApi = window.hermesAPI?.files;
              if (!filesApi?.getPreview) {
                if (!cancelled) setPreview({ status: "unavailable" });
                return;
              }
              const result = await filesApi.getPreview(undefined, managedFileId);
              if (cancelled) return;
              if (result && "error" in result) {
                setPreview({
                  status: "error",
                  message: result.error.message,
                });
              } else {
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
              }
            }
          } catch (error) {
            if (cancelled) return;
            setPreview({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : t("knowledge.documents.previewError"),
            });
          }
          return;
        }

        if (!probe.facade || probe.mode?.dataMode !== "mock") {
          setItems([]);
          setLoadState(
            probe.presentation === "unavailable" ? "unavailable" : "empty",
          );
          return;
        }
        const listed = await probe.facade.listEntities({ kind: "document" });
        if (cancelled) return;
        setItems(listed);
        setLoadState(listed.length > 0 ? "content" : "empty");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : t("knowledge.host.errorTitle"),
        );
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    probe.presentation,
    probe.facade,
    probe.mode?.dataMode,
    detailId,
    resolveManagedFileId,
    loadPreview,
  ]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && (item.permission?.visibility ?? "all") !== filter) {
        return false;
      }
      if (!q) return true;
      return (item.title ?? item.id).toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  if (detailId) {
    return (
      <div data-testid="knowledge-documents-page" data-state={loadState}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          data-testid="knowledge-documents-back"
          onClick={() => onBack?.()}
        >
          {t("knowledge.host.back")}
        </button>
        {loadState === "loading" ? (
          <KnowledgeLoading label={t("knowledge.loading")} />
        ) : null}
        {loadState === "not-found" ? (
          <KnowledgeEmptyState
            testId="knowledge-document-not-found"
            title={t("knowledge.host.notFoundTitle")}
            description={t("knowledge.host.notFoundDescription")}
          />
        ) : null}
        {loadState === "error" ? (
          <KnowledgeEmptyState
            title={t("knowledge.host.errorTitle")}
            description={errorMessage}
          />
        ) : null}
        {loadState === "content" && detail ? (
          <section
            className="settings-section"
            data-testid="knowledge-document-detail"
          >
            <h2>{detail.title ?? t("knowledge.documents.detailTitle")}</h2>
            <p data-testid="knowledge-document-detail-id">{detail.id}</p>
            <KnowledgeSectionTabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: "preview", label: t("knowledge.documents.tabPreview") },
                { id: "info", label: t("knowledge.documents.tabInfo") },
                { id: "versions", label: t("knowledge.documents.tabVersions") },
                { id: "parse", label: t("knowledge.documents.tabParse") },
                { id: "permission", label: t("knowledge.documents.tabPermission") },
              ]}
            />

            <section
              hidden={detailTab !== "preview"}
              data-testid="knowledge-document-preview"
            >
              <h3>{t("knowledge.documents.previewTitle")}</h3>
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

            <div hidden={detailTab !== "info"}>
              <p>
                {t("knowledge.documents.versionLabel")}:{" "}
                <span data-testid="knowledge-document-version">
                  {t("knowledge.documents.versionDraft")}
                </span>
              </p>
              <p>
                {t("knowledge.documents.parseLabel")}:{" "}
                <span data-testid="knowledge-document-parse">
                  {t("knowledge.documents.parseDraft")}
                </span>
              </p>
            </div>

            <div hidden={detailTab !== "versions"}>
              <p>{t("knowledge.documents.versionDraft")}</p>
            </div>

            <div hidden={detailTab !== "parse"}>
              <p>{t("knowledge.documents.parseDraft")}</p>
            </div>

            <div hidden={detailTab !== "permission"}>
              <p>
                {t("knowledge.documents.permissionLabel")}:{" "}
                <span
                  className="settings-card-badge"
                  data-testid="knowledge-document-permission"
                  data-display-only="true"
                >
                  {detail.permission?.role ?? "viewer"} /{" "}
                  {detail.permission?.visibility ?? "private"}
                </span>
              </p>
              <p data-testid="knowledge-document-permission-note">
                {t("knowledge.documents.permissionDisplayOnly")}
              </p>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="knowledge-documents-page" data-state={loadState}>
      {loadState === "loading" ? (
        <KnowledgeLoading label={t("knowledge.loading")} />
      ) : null}
      {loadState === "unavailable" ? (
        <KnowledgeEmptyState
          title={t("knowledge.unavailableTitle")}
          description={t("knowledge.unavailableDescription")}
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
            <KnowledgeSearchInput
              testId="knowledge-documents-search"
              placeholder={t("knowledge.host.searchPlaceholder")}
              value={search}
              onChange={setSearch}
            />
            <label>
              {t("knowledge.documents.filterStatus")}
              <select
                data-testid="knowledge-documents-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">{t("knowledge.host.filterAll")}</option>
                <option value="private">{t("knowledge.host.private")}</option>
                <option value="shared">{t("knowledge.host.shared")}</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!onNavigate}
              onClick={() => onNavigate?.({ page: "uploads", params: {} })}
            >
              {t("knowledge.documents.uploadAction")}
            </button>
          </KnowledgeToolbar>
          {filtered.length === 0 ? (
            <p data-testid="knowledge-document-list-empty">
              {t("knowledge.documents.emptyList")}
            </p>
          ) : (
            <div className="knowledge-table-wrap">
              <table className="knowledge-table" data-testid="knowledge-document-list">
                <thead>
                  <tr>
                    <th>{t("knowledge.documents.listTitle")}</th>
                    <th>{t("knowledge.documents.permissionLabel")}</th>
                    <th>{t("knowledge.host.open")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title ?? item.id}</td>
                      <td>{item.permission?.visibility ?? "private"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid={`knowledge-document-item-${item.id}`}
                          onClick={() =>
                            onNavigate?.({
                              page: "documents",
                              params: { documentId: item.id },
                            })
                          }
                        >
                          {t("knowledge.host.open")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default KnowledgeDocumentsPage;
