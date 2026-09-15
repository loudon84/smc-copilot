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
 * Knowledge Home dashboard: overview, recent entities, and shortcuts.
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
      // Provider: structure visible, no fake metrics / facade lists.
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

  const recent = [...sets, ...documents].slice(0, 6);

  return (
    <div data-testid="knowledge-home-page" data-state={loadState}>
      {loadState === "loading" ? <p>{t("knowledge.loading")}</p> : null}
      {loadState === "unavailable" ? (
        <section className="gateway-empty-state" aria-live="polite">
          <strong>{t("knowledge.unavailableTitle")}</strong>
          <p>{t("knowledge.unavailableDescription")}</p>
        </section>
      ) : null}
      {loadState === "error" ? (
        <section className="gateway-empty-state" aria-live="polite">
          <strong>{t("knowledge.host.errorTitle")}</strong>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {loadState === "empty" || loadState === "content" ? (
        <>
          <section data-testid="knowledge-home-overview" style={{ marginBottom: 16 }}>
            <h2 className="settings-header">{t("knowledge.home.overviewTitle")}</h2>
            {isMock ? (
              <ul data-testid="knowledge-home-metrics">
                <li>
                  {t("knowledge.home.basesCount")}: {bases.length}
                </li>
                <li>
                  {t("knowledge.home.setsCount")}: {sets.length}
                </li>
                <li>
                  {t("knowledge.home.documentsCount")}: {documents.length}
                </li>
              </ul>
            ) : (
              <p data-testid="knowledge-home-provider-no-metrics">
                {t("knowledge.home.providerNoMetrics")}
              </p>
            )}
            {loadState === "empty" ? (
              <p>{t("knowledge.emptyDescription")}</p>
            ) : null}
          </section>

          <section data-testid="knowledge-home-recent" style={{ marginBottom: 16 }}>
            <h2 className="settings-header">{t("knowledge.home.recentTitle")}</h2>
            {isMock && recent.length > 0 ? (
              <ul>
                {recent.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>{item.title ?? item.id}</li>
                ))}
              </ul>
            ) : (
              <p>{t("knowledge.emptyTitle")}</p>
            )}
          </section>

          <section data-testid="knowledge-home-shortcuts">
            <h2 className="settings-header">{t("knowledge.home.shortcutsTitle")}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
