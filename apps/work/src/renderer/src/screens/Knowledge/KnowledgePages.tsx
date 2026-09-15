import { useEffect, useState, type ReactElement } from "react";
import { useI18n } from "../../components/useI18n";
import type { KnowledgePageId } from "./knowledge-route-descriptor";
import type { KnowledgeCapabilitySnapshot } from "../../../../shared/knowledge/knowledge-job-ipc";

export type KnowledgePagesProps = {
  page: KnowledgePageId;
  /**
   * Optional capability override for tests.
   * Product path probes `window.hermesAPI.knowledgeJobs.getCapability`.
   */
  capability?: KnowledgeCapabilitySnapshot | null;
};

type PagePresentation = "loading" | "unavailable" | "empty";

const PAGE_TITLE_KEY: Record<KnowledgePageId, string> = {
  home: "knowledge.home.title",
  bases: "knowledge.bases.title",
  sets: "knowledge.sets.title",
  documents: "knowledge.documents.title",
  uploads: "knowledge.uploads.title",
  chat: "knowledge.chat.title",
};

const PAGE_DESCRIPTION_KEY: Record<KnowledgePageId, string> = {
  home: "knowledge.home.description",
  bases: "knowledge.bases.description",
  sets: "knowledge.sets.description",
  documents: "knowledge.documents.description",
  uploads: "knowledge.uploads.description",
  chat: "knowledge.chat.description",
};

function resolvePresentation(
  capability: KnowledgeCapabilitySnapshot | null | undefined,
): PagePresentation {
  if (capability === undefined) return "loading";
  if (capability === null || !capability.available) return "unavailable";
  // This Stage has no entity provider: available probe still means empty, never fixtures.
  return "empty";
}

function blockedCapability(): KnowledgeCapabilitySnapshot {
  return {
    available: false,
    status: "blocked_provider_unavailable",
  };
}

function readLiveCapabilityApi():
  | NonNullable<Window["hermesAPI"]>["knowledgeJobs"]
  | undefined {
  return window.hermesAPI?.knowledgeJobs;
}

/**
 * Six Stage Knowledge pages as fail-closed Work UI.
 * Entity reads and uploads stay unavailable/empty without a Main capability
 * provider; no fixture repositories, fake upload timers, or sendable Q&A.
 */
export function KnowledgePages({
  page,
  capability: injectedCapability,
}: KnowledgePagesProps): ReactElement {
  const { t } = useI18n();
  const [capability, setCapability] = useState<
    KnowledgeCapabilitySnapshot | null | undefined
  >(() => {
    if (injectedCapability !== undefined) return injectedCapability;
    const api = readLiveCapabilityApi();
    if (!api?.getCapability) return blockedCapability();
    return undefined;
  });

  useEffect(() => {
    if (injectedCapability !== undefined) {
      setCapability(injectedCapability);
      return;
    }

    const api = readLiveCapabilityApi();
    if (!api?.getCapability) {
      setCapability(blockedCapability());
      return;
    }

    let cancelled = false;
    void api
      .getCapability()
      .then((snapshot) => {
        if (!cancelled) setCapability(snapshot);
      })
      .catch(() => {
        if (!cancelled) setCapability(blockedCapability());
      });

    return () => {
      cancelled = true;
    };
  }, [injectedCapability, page]);

  const presentation = resolvePresentation(capability);
  const title = t(PAGE_TITLE_KEY[page]);
  const description = t(PAGE_DESCRIPTION_KEY[page]);

  let statusTitle = t("knowledge.loading");
  let statusDescription = "";
  if (presentation === "unavailable") {
    statusTitle = t("knowledge.unavailableTitle");
    statusDescription = t("knowledge.unavailableDescription");
  } else if (presentation === "empty") {
    statusTitle = t("knowledge.emptyTitle");
    statusDescription = t("knowledge.emptyDescription");
  }

  return (
    <div
      className="settings-container"
      data-testid={`knowledge-page-${page}`}
      data-page={page}
      data-state={presentation}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 className="settings-header" style={{ marginBottom: 4 }}>
          {title}
        </h1>
        <p className="gateway-page-subtitle">{description}</p>
      </header>

      <section
        aria-live="polite"
        className="gateway-empty-state"
        data-testid="knowledge-page-status"
      >
        <strong>{statusTitle}</strong>
        {statusDescription ? <p>{statusDescription}</p> : null}
        {page === "uploads" && presentation === "unavailable" ? (
          <p>{t("knowledge.uploads.pickerBlocked")}</p>
        ) : null}
        {page === "chat" && presentation !== "loading" ? (
          <p>{t("knowledge.chat.composerBlocked")}</p>
        ) : null}
      </section>
    </div>
  );
}

export default KnowledgePages;
