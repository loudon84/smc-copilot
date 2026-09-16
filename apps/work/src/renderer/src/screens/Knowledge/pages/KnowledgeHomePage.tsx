import { useEffect, useState, type ReactElement } from "react";
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
  KnowledgeLoading,
  KnowledgeSectionTitle,
} from "../knowledge-page-chrome";

export type KnowledgeHomePageProps = {
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
};

type HomeLoadState = "loading" | "unavailable" | "empty" | "content" | "error";

/**
 * Knowledge Home dashboard: overview cards, recent entities, and shortcuts.
 * Provider mode never paints fabricated counts.
 */
export function KnowledgeHomePage({
  onNavigate,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
}: KnowledgeHomePageProps): ReactElement {
  const { t } = useI18n();
  const probeOptions: UseKnowledgeFacadeOptions = {
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  };
  const probe = useKnowledgeFacade(probeOptions);
  const isMock = probe.mode?.dataMode === "mock";
  const [loadState, setLoadState] = useState<HomeLoadState>("loading");
  const [bases, setBases] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [sets, setSets] = useState<KnowledgeFacadeEntitySnapshot[]>([]);
  const [documents, setDocuments] = useState<KnowledgeFacadeEntitySnapshot[]>(
    [],
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (probe.presentation === "loading") {
      setLoadState("loading");
      return;
    }
    if (probe.presentation === "unavailable") {
      setLoadState("unavailable");
      return;
    }
    if (!isMock) {
      setBases([]);
      setSets([]);
      setDocuments([]);
      setLoadState("empty");
      return;
    }
    if (!probe.facade) {
      setLoadState("unavailable");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [baseList, setList, docList] = await Promise.all([
          probe.facade!.listEntities({ kind: "base" }),
          probe.facade!.listEntities({ kind: "set" }),
          probe.facade!.listEntities({ kind: "document" }),
        ]);
        if (cancelled) return;
        setBases(baseList);
        setSets(setList);
        setDocuments(docList);
        const hasAny =
          baseList.length > 0 || setList.length > 0 || docList.length > 0;
        setLoadState(hasAny ? "content" : "empty");
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
  }, [probe.presentation, probe.facade, isMock]);

  const recentSets = sets.slice(0, 4);
  const recentDocs = documents.slice(0, 4);
  const recent = [...sets, ...documents].slice(0, 6);

  return (
    <div data-testid="knowledge-home-page" data-state={loadState}>
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
          <section
            className="settings-section"
            data-testid="knowledge-home-overview"
          >
            <KnowledgeSectionTitle>
              {t("knowledge.home.overviewTitle")}
            </KnowledgeSectionTitle>
            {isMock ? (
              <div className="knowledge-card-grid" data-testid="knowledge-home-metrics">
                {(
                  [
                    ["bases", bases.length, "knowledge.home.basesCount"],
                    ["sets", sets.length, "knowledge.home.setsCount"],
                    ["documents", documents.length, "knowledge.home.documentsCount"],
                  ] as const
                ).map(([page, count, label]) => (
                  <button
                    key={page}
                    type="button"
                    className="settings-card knowledge-metric-card"
                    disabled={!onNavigate}
                    onClick={() => onNavigate?.({ page, params: {} })}
                  >
                    <div className="settings-card-head">
                      <strong>{t(label)}</strong>
                    </div>
                    <p>{count}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p data-testid="knowledge-home-provider-no-metrics">
                {t("knowledge.home.providerNoMetrics")}
              </p>
            )}
            {loadState === "empty" ? (
              <p>{t("knowledge.emptyDescription")}</p>
            ) : null}
          </section>

          <section className="settings-section" data-testid="knowledge-home-recent">
            <KnowledgeSectionTitle>
              {t("knowledge.home.recentTitle")}
            </KnowledgeSectionTitle>
            {isMock && recent.length > 0 ? (
              <div className="knowledge-card-grid">
                <div>
                  <h3>{t("knowledge.home.recentSets")}</h3>
                  <ul>
                    {recentSets.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={!onNavigate}
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
                </div>
                <div>
                  <h3>{t("knowledge.home.recentDocuments")}</h3>
                  <ul>
                    {recentDocs.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={!onNavigate}
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
                </div>
              </div>
            ) : (
              <p>{t("knowledge.emptyTitle")}</p>
            )}
          </section>

          <section
            className="settings-section"
            data-testid="knowledge-home-shortcuts"
          >
            <KnowledgeSectionTitle>
              {t("knowledge.home.shortcutsTitle")}
            </KnowledgeSectionTitle>
            <div className="knowledge-toolbar">
              {(
                [
                  ["bases", "knowledge.home.openBases"],
                  ["sets", "knowledge.home.openSets"],
                  ["documents", "knowledge.home.openDocuments"],
                  ["uploads", "knowledge.home.openUploads"],
                  ["chat", "knowledge.home.openChat"],
                ] as const
              ).map(([page, key]) => (
                <button
                  key={page}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-testid={`knowledge-home-shortcut-${page}`}
                  disabled={!onNavigate}
                  onClick={() => onNavigate?.({ page, params: {} })}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default KnowledgeHomePage;
