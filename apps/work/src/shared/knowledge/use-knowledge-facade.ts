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
import type { HermesKnowledgeBasesAPI } from "./knowledge-base-ipc";
import type { HermesKnowledgeSetsAPI } from "./knowledge-set-ipc";

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
  /** Optional typed Base API override for tests. */
  bases?: HermesKnowledgeBasesAPI | null;
  /** Optional typed Set API override for tests. */
  sets?: HermesKnowledgeSetsAPI | null;
};

export type KnowledgeFacadeProbe = {
  capability: KnowledgeCapabilitySnapshot | null | undefined;
  mode: KnowledgeModeSnapshot | null | undefined;
  facade: HermesKnowledgeFacadeAPI | null;
  bases: HermesKnowledgeBasesAPI | null;
  sets: HermesKnowledgeSetsAPI | null;
  presentation: KnowledgePagePresentation;
  /** Bases/Documents/Uploads/Sets: auth + capability (or explicit mock). */
  mutationsEnabled: boolean;
  /** Remaining mock-only surfaces (e.g. Chat synthetic). */
  syntheticMutationsEnabled: boolean;
};

type KnowledgeJobsSurface = HermesKnowledgeJobsAPI & {
  getMode?: () => Promise<KnowledgeModeSnapshot>;
  facade?: HermesKnowledgeFacadeAPI;
  bases?: HermesKnowledgeBasesAPI;
  sets?: HermesKnowledgeSetsAPI;
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
    bases: injectedBases,
    sets: injectedSets,
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

  const [bases, setBases] = useState<HermesKnowledgeBasesAPI | null>(() => {
    if (injectedBases !== undefined) return injectedBases;
    const api = readLiveJobsApi();
    return api?.bases ?? null;
  });

  useEffect(() => {
    if (injectedBases !== undefined) {
      setBases(injectedBases);
      return;
    }
    const api = readLiveJobsApi();
    setBases(api?.bases ?? null);
  }, [injectedBases]);

  const [sets, setSets] = useState<HermesKnowledgeSetsAPI | null>(() => {
    if (injectedSets !== undefined) return injectedSets;
    const api = readLiveJobsApi();
    return api?.sets ?? null;
  });

  useEffect(() => {
    if (injectedSets !== undefined) {
      setSets(injectedSets);
      return;
    }
    const api = readLiveJobsApi();
    setSets(api?.sets ?? null);
  }, [injectedSets]);

  const presentation = resolveKnowledgePresentation(capability, mode);
  const syntheticMutationsEnabled =
    mode?.dataMode === "mock" && mode.allowSyntheticData === true;
  const mutationsEnabled =
    syntheticMutationsEnabled ||
    (capability?.available === true && capability.status === "available");

  return {
    capability,
    mode,
    facade,
    bases,
    sets,
    presentation,
    mutationsEnabled,
    syntheticMutationsEnabled,
  };
}
