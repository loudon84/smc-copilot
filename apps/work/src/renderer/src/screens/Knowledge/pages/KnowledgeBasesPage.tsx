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
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [detail, setDetail] = useState<KnowledgeFacadeEntitySnapshot | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftTitle, setDraftTitle] = useState("");

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
    if (!q) return visible;
    return visible.filter((item) =>
      (item.title ?? item.id).toLowerCase().includes(q),
    );
  }, [items, search, removedIds]);

  const mutationsEnabled = probe.mutationsEnabled;

  const handleCreate = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.facade) return;
    await probe.facade.mutateEntity({
      kind: "base",
      patch: { title: draftTitle.trim() || "New base" },
    });
    setDraftTitle("");
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
    onBack?.();
  };

  if (detailId) {
    return (
      <div data-testid="knowledge-bases-page" data-state={loadState}>
        <button type="button" data-testid="knowledge-bases-back" onClick={() => onBack?.()}>
          {t("knowledge.host.back")}
        </button>
        {loadState === "loading" ? <p>{t("knowledge.loading")}</p> : null}
        {loadState === "not-found" ? (
          <section data-testid="knowledge-base-not-found">
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
          <section data-testid="knowledge-base-detail">
            <h2>{t("knowledge.bases.detailTitle")}</h2>
            <p data-testid="knowledge-base-detail-id">{detail.id}</p>
            <label>
              {t("knowledge.host.edit")}
              <input
                data-testid="knowledge-base-title-input"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                disabled={!mutationsEnabled}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
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
                data-testid="knowledge-base-delete"
                disabled={!mutationsEnabled}
                title={
                  mutationsEnabled
                    ? undefined
                    : t("knowledge.bases.mutateDisabled")
                }
                onClick={() => {
                  void handleDelete();
                }}
              >
                {t("knowledge.bases.deleteLabel")}
              </button>
            </div>
            {!mutationsEnabled ? (
              <p>{t("knowledge.bases.mutateDisabled")}</p>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="knowledge-bases-page" data-state={loadState}>
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
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              data-testid="knowledge-bases-search"
              placeholder={t("knowledge.host.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <input
              data-testid="knowledge-base-create-title"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              disabled={!mutationsEnabled}
              placeholder={t("knowledge.bases.createLabel")}
            />
            <button
              type="button"
              data-testid="knowledge-base-create"
              disabled={!mutationsEnabled}
              title={
                mutationsEnabled ? undefined : t("knowledge.bases.mutateDisabled")
              }
              onClick={() => {
                void handleCreate();
              }}
            >
              {t("knowledge.bases.createLabel")}
            </button>
          </div>
          {!mutationsEnabled ? <p>{t("knowledge.bases.mutateDisabled")}</p> : null}
          {filtered.length === 0 ? (
            <p data-testid="knowledge-base-list-empty">
              {t("knowledge.bases.emptyList")}
            </p>
          ) : (
            <ul data-testid="knowledge-base-list">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid={`knowledge-base-item-${item.id}`}
                    onClick={() =>
                      onNavigate?.({
                        page: "bases",
                        params: { knowledgeBaseId: item.id },
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

export default KnowledgeBasesPage;
