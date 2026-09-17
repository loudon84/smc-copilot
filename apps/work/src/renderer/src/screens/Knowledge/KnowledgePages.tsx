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
import type { HermesKnowledgeBasesAPI } from "../../../../shared/knowledge/knowledge-base-ipc";
import { KnowledgeModuleNav } from "./KnowledgeModuleNav";
import { KnowledgeHomePage } from "./pages/KnowledgeHomePage";
import { KnowledgeBasesPage } from "./pages/KnowledgeBasesPage";
import { KnowledgeBaseDetailPage } from "./pages/KnowledgeBaseDetailPage";
import { KnowledgeSetsPage } from "./pages/KnowledgeSetsPage";
import { KnowledgeDocumentsPage } from "./pages/KnowledgeDocumentsPage";
import { KnowledgeDocumentDetailPage } from "./pages/KnowledgeDocumentDetailPage";
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
  /** Optional typed Base API override for tests. */
  bases?: HermesKnowledgeBasesAPI | null;
};

/**
 * Knowledge page host: module nav + five Work-native pages over route-scope params.
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
  bases: injectedBases,
}: KnowledgePagesProps): ReactElement {
  const { t } = useI18n();
  const probeOptions: UseKnowledgeFacadeOptions = {
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  };
  const probe = useKnowledgeFacade(probeOptions);
  const { presentation, mode } = probe;
  const showMockBadge = mode?.dataMode === "mock";

  const pageOverrides = {
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  };

  let pageBody: ReactElement;
  switch (page) {
    case "home":
      pageBody = (
        <KnowledgeHomePage onNavigate={onNavigate} {...pageOverrides} />
      );
      break;
    case "bases":
      pageBody = params.knowledgeBaseId ? (
        <KnowledgeBaseDetailPage
          params={params}
          onNavigate={onNavigate}
          onBack={onBack}
          {...pageOverrides}
        />
      ) : (
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
      pageBody = params.documentId ? (
        <KnowledgeDocumentDetailPage
          params={params}
          onNavigate={onNavigate}
          onBack={onBack}
          {...pageOverrides}
        />
      ) : (
        <KnowledgeDocumentsPage
          params={params}
          onNavigate={onNavigate}
          onBack={onBack}
          {...pageOverrides}
        />
      );
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
      <KnowledgeModuleNav page={page} onNavigate={onNavigate} />

      <div className="knowledge-host-body">{pageBody}</div>
    </div>
  );
}

export default KnowledgePages;
