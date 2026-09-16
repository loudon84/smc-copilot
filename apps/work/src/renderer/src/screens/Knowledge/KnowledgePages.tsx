import { type ReactElement } from "react";
import { useI18n } from "../../components/useI18n";
import {
  type KnowledgeNavigateTarget,
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
import { KnowledgeModuleNav } from "./KnowledgeModuleNav";
import { KnowledgeHomePage } from "./pages/KnowledgeHomePage";
import { KnowledgeBasesPage } from "./pages/KnowledgeBasesPage";
import { KnowledgeSetsPage } from "./pages/KnowledgeSetsPage";
import { KnowledgeDocumentsPage } from "./pages/KnowledgeDocumentsPage";
import { KnowledgeUploadsPage } from "./pages/KnowledgeUploadsPage";
import { KnowledgeChatPage } from "./pages/KnowledgeChatPage";

export type { KnowledgeNavigateTarget } from "./knowledge-route-descriptor";

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

const PAGE_SUBTITLE_KEY: Record<KnowledgePageId, string> = {
  home: "knowledge.home.description",
  bases: "knowledge.bases.description",
  sets: "knowledge.sets.description",
  documents: "knowledge.documents.description",
  uploads: "knowledge.uploads.description",
  chat: "knowledge.chat.description",
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
  const subtitle = t(PAGE_SUBTITLE_KEY[page]);
  const showMockBadge = mode?.dataMode === "mock";

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
      className="settings-container knowledge-host"
      data-testid={`knowledge-page-${page}`}
      data-page={page}
      data-state={presentation}
      data-knowledge-mode={mode?.dataMode ?? "unknown"}
      data-knowledge-host="true"
    >
      {/*
      <header className="gateway-page-header knowledge-host-header">
        <div>
          <h1 className="settings-header">{title}</h1>
          <p className="gateway-page-subtitle">{subtitle}</p>
        </div>
        {showMockBadge ? (
          <span
            className="settings-card-badge is-update"
            data-testid="knowledge-mock-demo-badge"
            data-persistent="true"
            role="status"
            aria-live="polite"
          >
            {t("knowledge.mockDemoBadge")}
          </span>
        ) : null}
      </header>
        */}
      <KnowledgeModuleNav page={page} onNavigate={onNavigate} />

      <div className="knowledge-host-body">{pageBody}</div>
    </div>
  );
}

export default KnowledgePages;
