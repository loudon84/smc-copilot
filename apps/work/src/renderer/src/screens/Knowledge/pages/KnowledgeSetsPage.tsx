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

export type KnowledgeSetsPageProps = {
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

type SetsLoadState =
  | "loading"
  | "unavailable"
  | "empty"
  | "content"
  | "not-found"
  | "error";

/**
 * Knowledge Sets list/detail with local binding/weight drafts; provider submit disabled.
 */
export function KnowledgeSetsPage({
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
}: KnowledgeSetsPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  } satisfies UseKnowledgeFacadeOptions);
  const detailId = params.knowledgeSetId;
  const [loadState, setLoadState] = useState<SetsLoadState>("loading");
  const [items, setItems] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [detail, setDetail] = useState<KnowledgeFacadeEntitySnapshot | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [bindingWeight, setBindingWeight] = useState("1");
  const [retrievalMode, setRetrievalMode] = useState("hybrid");

  const refreshList = async (): Promise<void> => {
    if (!probe.facade || probe.mode?.dataMode !== "mock") {
      setItems([]);
      setLoadState(
        probe.presentation === "unavailable" ? "unavailable" : "empty",
      );
      return;
    }
    const listed = await probe.facade.listEntities({ kind: "set" });
    setItems(listed);
    setLoadState(listed.length > 0 ? "content" : "empty");
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
            kind: "set",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe.presentation, probe.facade, probe.mode?.dataMode, detailId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      (item.title ?? item.id).toLowerCase().includes(q),
    );
  }, [items, search]);

  const mutationsEnabled = probe.mutationsEnabled;

  const handleCreate = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.facade) return;
    await probe.facade.mutateEntity({
      kind: "set",
      patch: { title: draftTitle.trim() || "New set" },
    });
    setDraftTitle("");
    await refreshList();
  };

  const handleSubmitBindings = async (): Promise<void> => {
    if (!mutationsEnabled || !probe.facade || !detailId) return;
    const updated = await probe.facade.mutateEntity({
      kind: "set",
      entityId: detailId,
      patch: {
        title: draftTitle.trim() || detail?.title || "Set",
        weight: Number(bindingWeight) || 1,
        retrieval: retrievalMode,
      },
    });
    setDetail(updated);
  };

  if (detailId) {
    return (
      <div data-testid="knowledge-sets-page" data-state={loadState}>
        <button type="button" data-testid="knowledge-sets-back" onClick={() => onBack?.()}>
          {t("knowledge.host.back")}
        </button>
        {loadState === "loading" ? <p>{t("knowledge.loading")}</p> : null}
        {loadState === "not-found" ? (
          <section data-testid="knowledge-set-not-found">
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
          <section data-testid="knowledge-set-detail">
            <h2>{t("knowledge.sets.detailTitle")}</h2>
            <p data-testid="knowledge-set-detail-id">{detail.id}</p>
            <label>
              {t("knowledge.host.edit")}
              <input
                data-testid="knowledge-set-title-input"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                disabled={!mutationsEnabled}
              />
            </label>
            <section data-testid="knowledge-set-bindings" style={{ marginTop: 12 }}>
              <h3>{t("knowledge.sets.bindingTitle")}</h3>
              <label>
                {t("knowledge.sets.weightLabel")}
                <input
                  data-testid="knowledge-set-weight"
                  value={bindingWeight}
                  onChange={(event) => setBindingWeight(event.target.value)}
                  disabled={!mutationsEnabled}
                />
              </label>
            </section>
            <section data-testid="knowledge-set-retrieval" style={{ marginTop: 12 }}>
              <h3>{t("knowledge.sets.retrievalTitle")}</h3>
              <select
                data-testid="knowledge-set-retrieval-mode"
                value={retrievalMode}
                onChange={(event) => setRetrievalMode(event.target.value)}
                disabled={!mutationsEnabled}
              >
                <option value="hybrid">hybrid</option>
                <option value="keyword">keyword</option>
                <option value="vector">vector</option>
              </select>
            </section>
            <button
              type="button"
              data-testid="knowledge-set-submit"
              disabled={!mutationsEnabled}
              title={
                mutationsEnabled ? undefined : t("knowledge.sets.mutateDisabled")
              }
              onClick={() => {
                void handleSubmitBindings();
              }}
              style={{ marginTop: 12 }}
            >
              {t("knowledge.sets.submitBindings")}
            </button>
            {!mutationsEnabled ? (
              <p>{t("knowledge.sets.mutateDisabled")}</p>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="knowledge-sets-page" data-state={loadState}>
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
              data-testid="knowledge-sets-search"
              placeholder={t("knowledge.host.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <input
              data-testid="knowledge-set-create-title"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              disabled={!mutationsEnabled}
              placeholder={t("knowledge.sets.createLabel")}
            />
            <button
              type="button"
              data-testid="knowledge-set-create"
              disabled={!mutationsEnabled}
              title={
                mutationsEnabled ? undefined : t("knowledge.sets.mutateDisabled")
              }
              onClick={() => {
                void handleCreate();
              }}
            >
              {t("knowledge.sets.createLabel")}
            </button>
          </div>
          {!mutationsEnabled ? <p>{t("knowledge.sets.mutateDisabled")}</p> : null}
          {filtered.length === 0 ? (
            <p data-testid="knowledge-set-list-empty">
              {t("knowledge.sets.emptyList")}
            </p>
          ) : (
            <ul data-testid="knowledge-set-list">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid={`knowledge-set-item-${item.id}`}
                    onClick={() =>
                      onNavigate?.({
                        page: "sets",
                        params: { knowledgeSetId: item.id },
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

export default KnowledgeSetsPage;
