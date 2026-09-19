import type { ReactElement } from "react";
import { BusinessModuleUISurface } from "@/components/common/business-module-ui-surface";
import { DocumentDetail } from "@/components/knowledge/document-detail";
import { useI18n } from "../../../components/useI18n";
import {
  useKnowledgeFacade,
  type UseKnowledgeFacadeOptions,
} from "../../../../../shared/knowledge/use-knowledge-facade";
import type { HermesKnowledgeBasesAPI } from "../../../../../shared/knowledge/knowledge-base-ipc";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../../shared/knowledge/knowledge-job-ipc";
import type { KnowledgeRouteParams } from "../knowledge-route-descriptor";
import type { KnowledgeBaseFileSnapshot } from "../../../../../shared/knowledge/knowledge-base-ipc";

export type KnowledgeDocumentDetailPageProps = {
  params?: KnowledgeRouteParams;
  onNavigate?: (target: {
    page: string;
    params?: KnowledgeRouteParams;
  }) => void;
  onBack?: () => void;
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
  facade?: HermesKnowledgeFacadeAPI | null;
  bases?: HermesKnowledgeBasesAPI | null;
  /**
   * Test override: skip Main resolve and use a known ManagedFile id.
   * Production uses `bases.resolveDocumentPreview` via FilePreview Framework.
   */
  resolveManagedFileId?: (file: KnowledgeBaseFileSnapshot) => string | null;
  /** Optional preview probe for tests (Framework KnowledgeFileProvider). */
  loadPreview?: (
    fileId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Thin route/facade adapter — DocumentDetail Hybrid owns workspace UI.
 */
export function KnowledgeDocumentDetailPage({
  params = {},
  onNavigate,
  onBack,
  capability: injectedCapability,
  mode: injectedMode,
  facade: injectedFacade,
  bases: injectedBases,
  resolveManagedFileId,
  loadPreview,
}: KnowledgeDocumentDetailPageProps): ReactElement {
  const { t } = useI18n();
  const probe = useKnowledgeFacade({
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
    bases: injectedBases,
  } satisfies UseKnowledgeFacadeOptions);

  const detailId = params.documentId ?? "";

  return (
    <BusinessModuleUISurface
      module="knowledge"
      className="flex h-full min-h-0 flex-1 flex-col"
    >
      <DocumentDetail
        t={t}
        documentId={detailId}
        knowledgeBaseId={params.knowledgeBaseId ?? ""}
        bases={probe.bases}
        presentation={probe.presentation}
        mutationsEnabled={probe.mutationsEnabled}
        onNavigate={onNavigate}
        onBack={onBack}
        resolveManagedFileId={resolveManagedFileId}
        loadPreview={loadPreview}
      />
    </BusinessModuleUISurface>
  );
}

export default KnowledgeDocumentDetailPage;
