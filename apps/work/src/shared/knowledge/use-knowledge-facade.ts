/**
 * Shared Knowledge mode / capability / facade probe for Work Knowledge pages.
 * Injectable overrides keep host/page tests off the live IPC surface.
 */
import { useEffect, useState } from "react";
import type {
  HermesKnowledgeFacadeAPI,
  HermesKnowledgeJobsAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "./knowledge-job-ipc";

export type KnowledgePagePresentation =
  | "loading"
  | "unavailable"
  | "empty"
  | "ready";

export type UseKnowledgeFacadeOptions = {
  /** Optional capability override for tests. */
  capability?: KnowledgeCapabilitySnapshot | null;
  /** Optional mode override for tests. */
  mode?: KnowledgeModeSnapshot | null;
  /** Optional facade override for tests. */
  facade?: HermesKnowledgeFacadeAPI | null;
};

export type KnowledgeFacadeProbe = {
  capability: KnowledgeCapabilitySnapshot | null | undefined;
  mode: KnowledgeModeSnapshot | null | undefined;
  facade: HermesKnowledgeFacadeAPI | null;
  presentation: KnowledgePagePresentation;
  mutationsEnabled: boolean;
};

type KnowledgeJobsSurface = HermesKnowledgeJobsAPI & {
  getMode?: () => Promise<KnowledgeModeSnapshot>;
  facade?: HermesKnowledgeFacadeAPI;
};

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

function readLiveJobsApi(): KnowledgeJobsSurface | undefined {
  const hermesAPI = (
    globalThis as unknown as {
      hermesAPI?: { knowledgeJobs?: KnowledgeJobsSurface };
    }
  ).hermesAPI;
  return hermesAPI?.knowledgeJobs;
}

export function resolveKnowledgePresentation(
  capability: KnowledgeCapabilitySnapshot | null | undefined,
  mode: KnowledgeModeSnapshot | null | undefined,
): KnowledgePagePresentation {
  if (capability === undefined || mode === undefined) return "loading";
  if (mode?.dataMode === "mock") return "ready";
  if (capability === null || !capability.available) return "unavailable";
  return "empty";
}

/**
 * Probe Main-owned Knowledge mode, capability, and sanitized facade.
 * Product path uses `window.hermesAPI.knowledgeJobs`; tests inject overrides.
 */
export function useKnowledgeFacade(
  options: UseKnowledgeFacadeOptions = {},
): KnowledgeFacadeProbe {
  const {
    capability: injectedCapability,
    mode: injectedMode,
    facade: injectedFacade,
  } = options;

  const [capability, setCapability] = useState<
    KnowledgeCapabilitySnapshot | null | undefined
  >(() => {
    if (injectedCapability !== undefined) return injectedCapability;
    const api = readLiveJobsApi();
    if (!api?.getCapability) return blockedCapability();
    return undefined;
  });

  const [mode, setMode] = useState<KnowledgeModeSnapshot | null | undefined>(
    () => {
      if (injectedMode !== undefined) return injectedMode;
      const api = readLiveJobsApi();
      if (!api || !("getMode" in api) || !api.getMode) {
        return defaultProviderMode();
      }
      return undefined;
    },
  );

  const [facade, setFacade] = useState<HermesKnowledgeFacadeAPI | null>(() => {
    if (injectedFacade !== undefined) return injectedFacade;
    const api = readLiveJobsApi();
    return api?.facade ?? null;
  });

  useEffect(() => {
    if (injectedCapability !== undefined) {
      setCapability(injectedCapability);
      return;
    }

    const api = readLiveJobsApi();
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
  }, [injectedCapability]);

  useEffect(() => {
    if (injectedMode !== undefined) {
      setMode(injectedMode);
      return;
    }

    const api = readLiveJobsApi();
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
  }, [injectedMode]);

  useEffect(() => {
    if (injectedFacade !== undefined) {
      setFacade(injectedFacade);
      return;
    }
    const api = readLiveJobsApi();
    setFacade(api?.facade ?? null);
  }, [injectedFacade]);

  const presentation = resolveKnowledgePresentation(capability, mode);
  const mutationsEnabled =
    mode?.dataMode === "mock" && mode.allowSyntheticData === true;

  return {
    capability,
    mode,
    facade,
    presentation,
    mutationsEnabled,
  };
}
