import { type ReactElement } from "react";
import { useI18n } from "../../components/useI18n";
import {
  KNOWLEDGE_ROUTE_PAGES,
  type KnowledgePageId,
  type KnowledgeRouteParams,
} from "./knowledge-route-descriptor";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../shared/knowledge/use-knowledge-facade";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../shared/knowledge/knowledge-job-ipc";
import { KnowledgeHomePage } from "./pages/KnowledgeHomePage";
import { KnowledgeBasesPage } from "./pages/KnowledgeBasesPage";
import { KnowledgeSetsPage } from "./pages/KnowledgeSetsPage";
import { KnowledgeDocumentsPage } from "./pages/KnowledgeDocumentsPage";
import { KnowledgeUploadsPage } from "./pages/KnowledgeUploadsPage";
import { KnowledgeChatPage } from "./pages/KnowledgeChatPage";

/** Navigation target for Knowledge page host callbacks (route scope, not URL). */
export type KnowledgeNavigateTarget = {
  page: KnowledgePageId | string;
  params?: KnowledgeRouteParams;
};

export type KnowledgePagesProps = {
  page: KnowledgePageId;
  /** Route-scope params from the keep-alive KnowledgeView (no window URL). */
  params?: KnowledgeRouteParams;
  /** Push a Knowledge page via route scope. */
  onNavigate?: (target: KnowledgeNavigateTarget) => void;
  /** Replace current Knowledge route without stacking history. */
  onReplace?: (target: KnowledgeNavigateTarget) => void;
  /** Pop route-scope back stack. */
  onBack?: () => void;
  /**
   * Optional capability override for tests.
   * Product path probes `window.hermesAPI.knowledgeJobs.getCapability`.
   */
  capability?: KnowledgeCapabilitySnapshot | null;
  /** Optional mode override for tests. Product path probes getMode. */
  mode?: KnowledgeModeSnapshot | null;
  /** Optional facade override for tests. */
  facade?: HermesKnowledgeFacadeAPI | null;
};

const PAGE_TITLE_KEY: Record<KnowledgePageId, string> = {
  home: "knowledge.home.title",
  bases: "knowledge.bases.title",
  sets: "knowledge.sets.title",
  documents: "knowledge.documents.title",
  uploads: "knowledge.uploads.title",
  chat: "knowledge.chat.title",
};

const NAV_LABEL_KEY: Record<KnowledgePageId, string> = {
  home: "knowledge.nav.home",
  bases: "knowledge.nav.bases",
  sets: "knowledge.nav.sets",
  documents: "knowledge.nav.documents",
  uploads: "knowledge.nav.uploads",
  chat: "knowledge.nav.chat",
};

/**
 * Knowledge page host: module nav + six Work-native pages over route-scope params.
 * Fail-closed when provider capability is unavailable; mock mode stays operable.
 */
export function KnowledgePages({
  page,
  params = {},
  onNavigate,
  onReplace,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
}: KnowledgePagesProps): ReactElement {
  const { t } = useI18n();
  const probeOptions: UseKnowledgeFacadeOptions = {
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  };
  const probe = useKnowledgeFacade(probeOptions);
  const { presentation, mode } = probe;
  const title = t(PAGE_TITLE_KEY[page]);

  const pageOverrides = {
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  };

  let pageBody: ReactElement;
  switch (page) {
    case "home":
      pageBody = (
        <KnowledgeHomePage onNavigate={onNavigate} {...pageOverrides} />
      );
      break;
    case "bases":
      pageBody = (
        <KnowledgeBasesPage
          params={params}
          onNavigate={onNavigate}
          onBack={onBack}
          {...pageOverrides}
        />
      );
      break;
    case "sets":
      pageBody = (
        <KnowledgeSetsPage
          params={params}
          onNavigate={onNavigate}
          onBack={onBack}
          {...pageOverrides}
        />
      );
      break;
    case "documents":
      pageBody = (
        <KnowledgeDocumentsPage
          params={params}
          onNavigate={onNavigate}
          onBack={onBack}
          {...pageOverrides}
        />
      );
      break;
    case "uploads":
      pageBody = <KnowledgeUploadsPage {...pageOverrides} />;
      break;
    case "chat":
      pageBody = (
        <KnowledgeChatPage
          params={params}
          onNavigate={onNavigate}
          onReplace={onReplace}
          {...pageOverrides}
        />
      );
      break;
    default: {
      const _exhaustive: never = page;
      pageBody = <p>{String(_exhaustive)}</p>;
    }
  }

  return (
    <div
      className="settings-container"
      data-testid={`knowledge-page-${page}`}
      data-page={page}
      data-state={presentation}
      data-knowledge-mode={mode?.dataMode ?? "unknown"}
      data-knowledge-host="true"
    >
      <nav
        aria-label={t("knowledge.nav.label")}
        className="knowledge-module-nav"
        data-testid="knowledge-module-nav"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {KNOWLEDGE_ROUTE_PAGES.map((navPage) => {
          const active = navPage === page;
          return (
            <button
              key={navPage}
              type="button"
              data-testid={`knowledge-nav-${navPage}`}
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              disabled={!onNavigate}
              onClick={() => {
                if (!onNavigate) return;
                onNavigate({ page: navPage, params: {} });
              }}
              style={{
                fontWeight: active ? 600 : 400,
              }}
            >
              {t(NAV_LABEL_KEY[navPage])}
            </button>
          );
        })}
      </nav>

      <header style={{ marginBottom: 16 }}>
        <h1 className="settings-header" style={{ marginBottom: 4 }}>
          {title}
        </h1>
        <p className="gateway-page-subtitle">{t("knowledge.host.subtitle")}</p>
      </header>

      {pageBody}
    </div>
  );
}

export default KnowledgePages;
