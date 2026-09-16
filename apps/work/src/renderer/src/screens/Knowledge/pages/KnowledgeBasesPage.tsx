import { useEffect, useMemo, useState, type ReactElement } from "react";
import { LayoutGrid, List } from "lucide-react";
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
import {
  KnowledgeEmptyState,
  KnowledgeEntityModal,
  KnowledgeLoading,
  KnowledgeSearchInput,
  KnowledgeSectionTabs,
  KnowledgeToolbar,
} from "../knowledge-page-chrome";

export type KnowledgeBasesPageProps = {
  params?: KnowledgeRouteParams;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onBack?: () => void;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
};

type BasesLoadState =
  | "loading"
  | "unavailable"
  | "empty"
  | "content"
  | "not-found"
  | "error";

type BaseDetailTab = "documents" | "settings" | "members" | "runtime";

/**
 * Knowledge Bases list/detail with local search/filter and mock-only mutate.
 */
export function KnowledgeBasesPage({
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
}: KnowledgeBasesPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  } satisfies UseKnowledgeFacadeOptions);
  const detailId = params.knowledgeBaseId;
  const [loadState, setLoadState] = useState<BasesLoadState>("loading");
  const [items, setItems] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [documents, setDocuments] = useState<KnowledgeFacadeEntitySnapshot[]>(
    [],
  );
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [detail, setDetail] = useState<KnowledgeFacadeEntitySnapshot | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [view, setView] = useState<"card" | "table">("card");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailTab, setDetailTab] = useState<BaseDetailTab>("settings");

  const refreshList = async (): Promise<void> => {
    if (!probe.facade || probe.mode?.dataMode !== "mock") {
      setItems([]);
      setLoadState(
        probe.presentation === "unavailable" ? "unavailable" : "empty",
      );
      return;
    }
    const listed = await probe.facade.listEntities({ kind: "base" });
    const visible = listed.filter((item) => !removedIds.has(item.id));
    setItems(visible);
    setLoadState(visible.length > 0 ? "content" : "empty");
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

    let cancelled = false;
    void (async () => {
      try {
        if (detailId) {
          if (!probe.facade || probe.mode?.dataMode !== "mock") {
            if (!cancelled) setLoadState("not-found");
            return;
          }
          const entity = await probe.facade.getEntity({
            kind: "base",
            entityId: detailId,
          });
          if (cancelled) return;
          if (!entity) {
            setDetail(null);
            setLoadState("not-found");
            return;
          }
          setDetail(entity);
          setDraftTitle(entity.title ?? "");
          const docs = await probe.facade.listEntities({ kind: "document" });
          if (cancelled) return;
          setDocuments(docs);
          setLoadState("content");
          return;
        }
        await refreshList();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh tied to probe/detail
  }, [probe.presentation, probe.facade, probe.mode?.dataMode, detailId]);

  const filtered = useMemo(() => {
    const visible = items.filter((item) => !removedIds.has(item.id));
    const q = search.trim().toLowerCase();
    return visible.filter((item) => {
      if (
        visibility !== "all" &&
        (item.permission?.visibility ?? "private") !== visibility
      ) {
        return false;
      }
      if (!q) return true;
      return (item.title ?? item.id).toLowerCase().includes(q);
    });
  }, [items, search, removedIds, visibility]);

  const mutationsEnabled = probe.mutationsEnabled;

  const handleCreate = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.facade) return;
    await probe.facade.mutateEntity({
      kind: "base",
      patch: { title: draftTitle.trim() || "New base" },
    });
    setDraftTitle("");
    setDialogOpen(false);
    await refreshList();
  };

  const handleSaveDetail = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.facade || !detailId) return;
    const updated = await probe.facade.mutateEntity({
      kind: "base",
      entityId: detailId,
      patch: { title: draftTitle.trim() || detail?.title || "Base" },
    });
    setDetail(updated);
  };

  const handleDelete = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.facade || !detailId) return;
    await probe.facade.mutateEntity({
      kind: "base",
      entityId: detailId,
      patch: { title: detail?.title, deleted: true },
    });
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(detailId);
      return next;
    });
    setItems((prev) => prev.filter((item) => item.id !== detailId));
    setConfirmDelete(false);
    onBack?.();
  };

  const openItem = (id: string): void => {
    onNavigate?.({ page: "bases", params: { knowledgeBaseId: id } });
  };

  if (detailId) {
    return (
      <div data-testid="knowledge-bases-page" data-state={loadState}>
        <div className="knowledge-toolbar">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="knowledge-bases-back"
            onClick={() => onBack?.()}
          >
            {t("knowledge.host.back")}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!onNavigate}
            onClick={() => onNavigate?.({ page: "uploads", params: {} })}
          >
            {t("knowledge.bases.uploadAction")}
          </button>
        </div>
        {loadState === "loading" ? (
          <KnowledgeLoading label={t("knowledge.loading")} />
        ) : null}
        {loadState === "not-found" ? (
          <KnowledgeEmptyState
            testId="knowledge-base-not-found"
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
          <section className="settings-section" data-testid="knowledge-base-detail">
            <h2>{detail.title ?? t("knowledge.bases.detailTitle")}</h2>
            <p data-testid="knowledge-base-detail-id">{detail.id}</p>
            <KnowledgeSectionTabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: "documents", label: t("knowledge.bases.tabDocuments") },
                { id: "settings", label: t("knowledge.bases.tabSettings") },
                { id: "members", label: t("knowledge.bases.tabMembers") },
                { id: "runtime", label: t("knowledge.bases.tabRuntime") },
              ]}
            />

            <div hidden={detailTab !== "documents"}>
              <p>{t("knowledge.bases.documentsNote")}</p>
              {documents.length === 0 ? (
                <p>{t("knowledge.documents.emptyList")}</p>
              ) : (
                <ul>
                  {documents.map((doc) => (
                    <li key={doc.id}>{doc.title ?? doc.id}</li>
                  ))}
                </ul>
              )}
            </div>

            <div hidden={detailTab !== "settings"}>
              <label className="settings-field">
                {t("knowledge.host.edit")}
                <input
                  data-testid="knowledge-base-title-input"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  disabled={!mutationsEnabled}
                />
              </label>
              <div className="knowledge-toolbar">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-testid="knowledge-base-save"
                  disabled={!mutationsEnabled}
                  title={
                    mutationsEnabled
                      ? undefined
                      : t("knowledge.bases.mutateDisabled")
                  }
                  onClick={() => {
                    void handleSaveDetail();
                  }}
                >
                  {t("knowledge.host.save")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-testid="knowledge-base-delete"
                  disabled={!mutationsEnabled}
                  title={
                    mutationsEnabled
                      ? undefined
                      : t("knowledge.bases.mutateDisabled")
                  }
                  onClick={() => setConfirmDelete(true)}
                >
                  {t("knowledge.bases.deleteLabel")}
                </button>
              </div>
            </div>

            <div hidden={detailTab !== "members"}>
              <span
                className="settings-card-badge"
                data-display-only="true"
              >
                {detail.permission?.role ?? "viewer"} /{" "}
                {detail.permission?.visibility ?? "private"}
              </span>
              <p>{t("knowledge.bases.membersNote")}</p>
            </div>

            <div hidden={detailTab !== "runtime"}>
              <p>{t("knowledge.bases.runtimeEmpty")}</p>
            </div>

            {!mutationsEnabled ? (
              <p>{t("knowledge.bases.mutateDisabled")}</p>
            ) : null}

            <KnowledgeEntityModal
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title={t("knowledge.bases.deleteLabel")}
            >
              <div className="knowledge-toolbar">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t("knowledge.host.cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    void handleDelete();
                  }}
                >
                  {t("knowledge.host.confirm")}
                </button>
              </div>
            </KnowledgeEntityModal>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="knowledge-bases-page" data-state={loadState}>
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
              testId="knowledge-bases-search"
              placeholder={t("knowledge.host.searchPlaceholder")}
              value={search}
              onChange={setSearch}
            />
            <label>
              {t("knowledge.host.visibility")}
              <select
                data-testid="knowledge-bases-visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value)}
              >
                <option value="all">{t("knowledge.host.filterAll")}</option>
                <option value="private">{t("knowledge.host.private")}</option>
                <option value="shared">{t("knowledge.host.shared")}</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="knowledge-bases-view-card"
              aria-pressed={view === "card"}
              onClick={() => setView("card")}
            >
              <LayoutGrid size={14} /> {t("knowledge.host.viewCard")}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="knowledge-bases-view-table"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <List size={14} /> {t("knowledge.host.viewTable")}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="knowledge-base-create"
              disabled={!mutationsEnabled}
              title={
                mutationsEnabled ? undefined : t("knowledge.bases.mutateDisabled")
              }
              onClick={() => setDialogOpen(true)}
            >
              {t("knowledge.bases.createLabel")}
            </button>
          </KnowledgeToolbar>
          {!mutationsEnabled ? <p>{t("knowledge.bases.mutateDisabled")}</p> : null}
          {filtered.length === 0 ? (
            <p data-testid="knowledge-base-list-empty">
              {t("knowledge.bases.emptyList")}
            </p>
          ) : view === "card" ? (
            <div className="knowledge-card-grid" data-testid="knowledge-base-list">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="settings-card knowledge-entity-card"
                  data-testid={`knowledge-base-item-${item.id}`}
                  onClick={() => openItem(item.id)}
                >
                  <div className="settings-card-head">
                    <strong>{item.title ?? item.id}</strong>
                    <span className="settings-card-badge">
                      {item.permission?.visibility ?? "private"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="knowledge-table-wrap">
              <table className="knowledge-table" data-testid="knowledge-base-list">
                <thead>
                  <tr>
                    <th>{t("knowledge.bases.listTitle")}</th>
                    <th>{t("knowledge.host.visibility")}</th>
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
                          data-testid={`knowledge-base-item-${item.id}`}
                          onClick={() => openItem(item.id)}
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

          <KnowledgeEntityModal
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            title={t("knowledge.bases.createLabel")}
          >
            <label className="settings-field">
              {t("knowledge.host.namePlaceholder")}
              <input
                data-testid="knowledge-base-create-title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                disabled={!mutationsEnabled}
                placeholder={t("knowledge.bases.createLabel")}
              />
            </label>
            <div className="knowledge-toolbar">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDialogOpen(false)}
              >
                {t("knowledge.host.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!mutationsEnabled}
                onClick={() => {
                  void handleCreate();
                }}
              >
                {t("knowledge.host.create")}
              </button>
            </div>
          </KnowledgeEntityModal>
        </>
      ) : null}
    </div>
  );
}

export default KnowledgeBasesPage;
