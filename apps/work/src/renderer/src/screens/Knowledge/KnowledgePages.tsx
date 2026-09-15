import { useEffect, useState, type ReactElement } from "react";
import { useI18n } from "../../components/useI18n";
import type { KnowledgePageId } from "./knowledge-route-descriptor";
import type {
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../../../../shared/knowledge/knowledge-job-ipc";

export type KnowledgePagesProps = {
  page: KnowledgePageId;
  /**
   * Optional capability override for tests.
   * Product path probes `window.hermesAPI.knowledgeJobs.getCapability`.
   */
  capability?: KnowledgeCapabilitySnapshot | null;
  /** Optional mode override for tests. Product path probes getMode. */
  mode?: KnowledgeModeSnapshot | null;
};

type PagePresentation = "loading" | "unavailable" | "empty" | "ready";

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
  mode: KnowledgeModeSnapshot | null | undefined,
): PagePresentation {
  if (capability === undefined || mode === undefined) return "loading";
  // Mock mode: badge-driven ready shell only — no fixture lists/layouts (RM-04).
  if (mode?.dataMode === "mock") return "ready";
  if (capability === null || !capability.available) return "unavailable";
  // Provider mode: available probe still means empty, never fixtures.
  return "empty";
}

function blockedCapability(): KnowledgeCapabilitySnapshot {
  return {
    available: false,
    status: "blocked_provider_unavailable",
  };
}

function defaultProviderMode(): KnowledgeModeSnapshot {
  return {
    dataMode: "provider",
    allowSyntheticData: false,
    configSource: "default",
  };
}

function readLiveCapabilityApi():
  | NonNullable<Window["hermesAPI"]>["knowledgeJobs"]
  | undefined {
  return window.hermesAPI?.knowledgeJobs;
}

/**
 * Six Stage Knowledge pages as fail-closed Work UI.
 * Provider mode stays unavailable/empty. Mock mode may show a ready shell
 * driven by Main mode, but never grows list/detail/chat layouts this Stage.
 */
export function KnowledgePages({
  page,
  capability: injectedCapability,
  mode: injectedMode,
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
  const [mode, setMode] = useState<KnowledgeModeSnapshot | null | undefined>(
    () => {
      if (injectedMode !== undefined) return injectedMode;
      const api = readLiveCapabilityApi();
      if (!api || !("getMode" in api) || !api.getMode) {
        return defaultProviderMode();
      }
      return undefined;
    },
  );

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

  useEffect(() => {
    if (injectedMode !== undefined) {
      setMode(injectedMode);
      return;
    }

    const api = readLiveCapabilityApi();
    const getMode = api && "getMode" in api ? api.getMode : undefined;
    if (!getMode) {
      setMode(defaultProviderMode());
      return;
    }

    let cancelled = false;
    void getMode()
      .then((snapshot) => {
        if (!cancelled) setMode(snapshot);
      })
      .catch(() => {
        if (!cancelled) setMode(defaultProviderMode());
      });

    return () => {
      cancelled = true;
    };
  }, [injectedMode, page]);

  const presentation = resolvePresentation(capability, mode);
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
  } else if (presentation === "ready") {
    statusTitle = t("knowledge.mockReadyTitle");
    statusDescription = t("knowledge.mockReadyDescription");
  }

  return (
    <div
      className="settings-container"
      data-testid={`knowledge-page-${page}`}
      data-page={page}
      data-state={presentation}
      data-knowledge-mode={mode?.dataMode ?? "unknown"}
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
