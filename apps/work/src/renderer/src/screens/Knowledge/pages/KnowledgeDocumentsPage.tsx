import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useI18n } from "../../../components/useI18n";
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
  | { status: "ready"; fileId: string }
  | { status: "error"; message: string };

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
  const [filter, setFilter] = useState("all");
  const [errorMessage, setErrorMessage] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

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
                setPreview({ status: "ready", fileId: managedFileId });
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
    if (filter === "all") return items;
    return items.filter(
      (item) => (item.permission?.visibility ?? "all") === filter,
    );
  }, [items, filter]);

  if (detailId) {
    return (
      <div data-testid="knowledge-documents-page" data-state={loadState}>
        <button
          type="button"
          data-testid="knowledge-documents-back"
          onClick={() => onBack?.()}
        >
          {t("knowledge.host.back")}
        </button>
        {loadState === "loading" ? <p>{t("knowledge.loading")}</p> : null}
        {loadState === "not-found" ? (
          <section data-testid="knowledge-document-not-found">
            <strong>{t("knowledge.host.notFoundTitle")}</strong>
            <p>{t("knowledge.host.notFoundDescription")}</p>
          </section>
        ) : null}
        {loadState === "error" ? (
          <section>
            <strong>{t("knowledge.host.errorTitle")}</strong>
            <p>{errorMessage}</p>
          </section>
        ) : null}
        {loadState === "content" && detail ? (
          <section data-testid="knowledge-document-detail">
            <h2>{t("knowledge.documents.detailTitle")}</h2>
            <p data-testid="knowledge-document-detail-id">{detail.id}</p>
            <p>
              {t("knowledge.documents.versionLabel")}:{" "}
              <span data-testid="knowledge-document-version">1</span>
            </p>
            <p>
              {t("knowledge.documents.parseLabel")}:{" "}
              <span data-testid="knowledge-document-parse">indexed</span>
            </p>
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

            <section data-testid="knowledge-document-preview" style={{ marginTop: 12 }}>
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
                <p data-testid="knowledge-document-preview-ready">
                  ManagedFile {preview.fileId}
                </p>
              ) : null}
              {preview.status === "error" ? (
                <p data-testid="knowledge-document-preview-error">
                  {t("knowledge.documents.previewError")}: {preview.message}
                </p>
              ) : null}
            </section>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="knowledge-documents-page" data-state={loadState}>
      {loadState === "loading" ? <p>{t("knowledge.loading")}</p> : null}
      {loadState === "unavailable" ? (
        <section className="gateway-empty-state" aria-live="polite">
          <strong>{t("knowledge.unavailableTitle")}</strong>
          <p>{t("knowledge.unavailableDescription")}</p>
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
          <label>
            {t("knowledge.documents.filterStatus")}
            <select
              data-testid="knowledge-documents-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">{t("knowledge.host.filterAll")}</option>
              <option value="private">private</option>
              <option value="shared">shared</option>
            </select>
          </label>
          {filtered.length === 0 ? (
            <p data-testid="knowledge-document-list-empty">
              {t("knowledge.documents.emptyList")}
            </p>
          ) : (
            <ul data-testid="knowledge-document-list">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid={`knowledge-document-item-${item.id}`}
                    onClick={() =>
                      onNavigate?.({
                        page: "documents",
                        params: { documentId: item.id },
                      })
                    }
                  >
                    {item.title ?? item.id}
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

export default KnowledgeDocumentsPage;
