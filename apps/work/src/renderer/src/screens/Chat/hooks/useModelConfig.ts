import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, displayBrandFromConfig } from "../../../constants";
import { useI18n } from "../../../components/useI18n";
import type { ModelGroup } from "../types";

const OLLAMA_CLOUD_PROVIDER = "ollama-cloud";

/**
 * Named providers (deepseek, groq, anthropic, …) have a hardcoded canonical
 * base_url in hermes-agent's PROVIDER_REGISTRY, so a stored `baseUrl` on those
 * entries can be stale and would misroute the request. Keep the baseUrl only
 * for `custom` and `ollama-cloud` entries, where it is authoritative; clear it
 * otherwise so the backend falls back to the provider's canonical URL. Shared
 * by `selectModel` and the chat-screen session override so they can't drift.
 */
export function effectiveOverrideBaseUrl(
  provider: string,
  baseUrl: string,
): string {
  return provider === "custom" || provider === OLLAMA_CLOUD_PROVIDER
    ? baseUrl
    : "";
}

interface SavedModelForPicker {
  provider: string;
  model: string;
  name: string;
  baseUrl?: string;
  providerRef?: string;
}

interface RuntimeSnapshot {
  state: string;
  backendState?: string | null;
  errorCode?: string | null;
  modelIds?: string[];
}

interface UseModelConfigResult {
  currentModel: string;
  currentProvider: string;
  currentBaseUrl: string;
  modelGroups: ModelGroup[];
  displayModel: string;
  runtimeStatus: string;
  showRuntimeRefresh: boolean;
  refreshRuntime: () => Promise<void>;
  reload: () => Promise<void>;
  selectModel: (
    provider: string,
    model: string,
    baseUrl: string,
    options?: { persist?: boolean },
  ) => Promise<void>;
}

function modelIdentityKey(
  provider: string,
  model: string,
  baseUrl: string,
): string {
  const url = (baseUrl || "").trim().replace(/\/+$/, "").toLowerCase();
  return `${provider}\0${model}\0${url}`;
}

function groupModelsByProvider(models: SavedModelForPicker[]): ModelGroup[] {
  const groupMap = new Map<string, ModelGroup>();
  const seenInGroup = new Map<string, Set<string>>();
  for (const m of models) {
    // Group by display brand so OpenAI-compatible providers stored as `custom`
    // (SMC Copilot, Groq, …) show under their own header instead of the generic
    // "OpenAI Compatible / Local" bucket. Each model keeps its raw provider +
    // baseUrl below so selection/routing is unchanged.
    const brand = displayBrandFromConfig(m.provider, m.baseUrl || "");
    if (!groupMap.has(brand)) {
      groupMap.set(brand, {
        provider: brand,
        providerLabel: PROVIDERS.labels[brand] || brand,
        models: [],
      });
      seenInGroup.set(brand, new Set());
    }
    const identity = modelIdentityKey(m.provider, m.model, m.baseUrl || "");
    const seen = seenInGroup.get(brand)!;
    if (seen.has(identity)) continue;
    seen.add(identity);
    groupMap.get(brand)!.models.push({
      provider: m.provider,
      model: m.model,
      label: m.name,
      baseUrl: m.baseUrl || "",
      providerRef: m.providerRef,
    });
  }
  return Array.from(groupMap.values());
}

function syncFailureLeavesLocalChat(snapshot: {
  state: string;
  errorCode?: string | null;
}): boolean {
  return (
    snapshot.state === "NOT_READY" ||
    (snapshot.state === "ERROR" &&
      snapshot.errorCode === "RUNTIME_BOOTSTRAP_UNAVAILABLE")
  );
}

function runtimeStatusKey(snapshot: RuntimeSnapshot): string {
  if (snapshot.state === "FETCHING") return "chat.runtimeProvider.fetching";
  if (snapshot.state === "APPLYING") return "chat.runtimeProvider.applying";
  if (snapshot.state === "CLEARING") return "chat.runtimeProvider.clearing";
  if (snapshot.state === "ACTIVE") return "chat.runtimeProvider.active";
  if (snapshot.state === "STALE_ACTIVE") return "chat.runtimeProvider.staleActive";
  // Unbound and other enterprise sync results stay on the diagnostics card.
  if (snapshot.state === "UNBOUND" || syncFailureLeavesLocalChat(snapshot)) return "";
  if (snapshot.state === "ERROR") return "chat.runtimeProvider.error";
  return "";
}

function currentProfileKey(profile?: string): string {
  const value = (profile || "default").trim();
  return value || "default";
}

export function useModelConfig(profile?: string): UseModelConfigResult {
  const { t } = useI18n();
  const [currentModel, setCurrentModel] = useState("");
  const [currentProvider, setCurrentProvider] = useState("auto");
  const [currentBaseUrl, setCurrentBaseUrl] = useState("");
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [runtime, setRuntime] = useState<RuntimeSnapshot>({ state: "UNBOUND" });
  const loadSeqRef = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    const seq = ++loadSeqRef.current;
    const [mc, configuredModels, runtimeState] = await Promise.all([
      window.hermesAPI.getModelConfig(profile),
      window.hermesAPI.listModels(profile),
      window.hermesAPI.getRuntimeProviderState
        ? window.hermesAPI.getRuntimeProviderState(profile)
        : Promise.resolve({ state: "UNBOUND" as const, modelIds: [] as string[] }),
    ]);
    if (seq !== loadSeqRef.current) return;
    setCurrentModel(mc.model);
    setCurrentProvider(mc.provider);
    setCurrentBaseUrl(mc.baseUrl);
    setRuntime({
      state: runtimeState.state,
      backendState:
        "backendState" in runtimeState ? runtimeState.backendState : null,
      errorCode: "errorCode" in runtimeState ? runtimeState.errorCode : null,
      modelIds: runtimeState.modelIds,
    });
    const allowed = new Set(runtimeState.modelIds || []);
    const localModels = configuredModels.filter(
      (row) => row.providerRef !== "named:nodeskclaw",
    );
    const visible =
      runtimeState.state === "ACTIVE" || runtimeState.state === "STALE_ACTIVE"
        ? configuredModels.filter(
            (row) =>
              row.providerRef === "named:nodeskclaw" && allowed.has(row.model),
          )
        : runtimeState.state === "UNBOUND" ||
            syncFailureLeavesLocalChat(runtimeState)
          ? localModels
          : [];
    setModelGroups(groupModelsByProvider(visible));
  }, [profile]);

  // Initial load + reload whenever the profile changes (canonical
  // load-on-mount; setState happens inside `reload` via an awaited IPC call).
  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    return window.hermesAPI.onConnectionConfigChanged(() => {
      setModelGroups([]);
      void reload();
    });
  }, [reload]);

  useEffect(() => {
    return window.hermesAPI.onModelLibraryChanged(() => {
      void reload();
    });
  }, [reload]);

  useEffect(() => {
    const subscribe = window.hermesAPI.onRuntimeProviderStateChanged;
    if (!subscribe) return;
    return subscribe((event) => {
      if (event.profile !== currentProfileKey(profile)) return;
      setRuntime(event);
      void reload();
    });
  }, [profile, reload]);

  const selectModel = useCallback(
    async (
      provider: string,
      model: string,
      baseUrl: string,
      { persist = true }: { persist?: boolean } = {},
    ): Promise<void> => {
      const effectiveBaseUrl = effectiveOverrideBaseUrl(provider, baseUrl);
      setCurrentModel(model);
      setCurrentProvider(provider);
      setCurrentBaseUrl(effectiveBaseUrl);
      // Session-only selection: update local state only, do not write to
      // config.yaml so the global default model is preserved (issue #688).
      // Advance the sequence counter so any in-flight reload() triggered by
      // onConnectionConfigChanged / onModelLibraryChanged cannot clobber the
      // session-scoped selection with the persisted value.
      if (!persist) {
        ++loadSeqRef.current;
        return;
      }
      const seq = ++loadSeqRef.current;
      try {
        await window.hermesAPI.setModelConfig(
          provider,
          model,
          effectiveBaseUrl,
          profile,
        );
        const mc = await window.hermesAPI.getModelConfig(profile);
        if (seq !== loadSeqRef.current) return;
        setCurrentModel(mc.model);
        setCurrentProvider(mc.provider);
        setCurrentBaseUrl(mc.baseUrl);
      } catch (err) {
        if (seq === loadSeqRef.current) await reload();
        throw err;
      }
    },
    [profile, reload],
  );

  const displayModel = useMemo(
    () =>
      currentModel
        ? currentModel.split("/").pop() || currentModel
        : currentProvider === "auto"
          ? t("chat.auto")
          : t("chat.noModel"),
    [currentModel, currentProvider, t],
  );
  const runtimeStatus = runtimeStatusKey(runtime)
    ? t(runtimeStatusKey(runtime), { code: runtime.errorCode || "" })
    : "";
  const showRuntimeRefresh =
    runtime.state === "STALE_ACTIVE" ||
    (runtime.state === "ERROR" && !syncFailureLeavesLocalChat(runtime));
  const refreshRuntime = useCallback(async (): Promise<void> => {
    if (!window.hermesAPI.refreshRuntimeProvider) return;
    await window.hermesAPI.refreshRuntimeProvider();
    await reload();
  }, [reload]);

  return {
    currentModel,
    currentProvider,
    currentBaseUrl,
    modelGroups,
    displayModel,
    runtimeStatus,
    showRuntimeRefresh,
    refreshRuntime,
    reload,
    selectModel,
  };
}
