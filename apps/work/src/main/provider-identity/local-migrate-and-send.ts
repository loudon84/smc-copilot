import type { RegistryProviderView } from "./runtime-provider-resolver";
import { resolveRuntimeProvider } from "./runtime-provider-resolver";
import {
  matchLegacyProvider,
  type LegacyRegistryRecord,
} from "./legacy-identity";

export type LocalChatRouteError =
  | "SESSION_PROVIDER_UNRESOLVED"
  | "ACTIVE_MODEL_PROVIDER_UNRESOLVED"
  | "PROVIDER_PROJECTION_DRIFT"
  | "PROVIDER_SECRET_MISSING"
  | "PROVIDER_RUNTIME_RELOAD_FAILED"
  | "PROVIDER_ROUTE_UNRESOLVED"
  | "PROVIDER_IDENTITY_AMBIGUOUS";

export type LocalChatRouteResult =
  | { ok: true; action: "passthrough" }
  | {
      ok: true;
      action: "send";
      hermesProvider: string;
      providerRef: string;
      strategy: "builtin" | "named-config";
      requests: 1;
    }
  | { ok: false; error: LocalChatRouteError; requests: 0 };

function needsCanonicalRoute(provider: string | undefined, providerRef?: string): boolean {
  if (providerRef) return true;
  const value = (provider || "").trim();
  return value === "custom" || value.startsWith("custom:");
}

export function redactRouteLog(entry: Record<string, unknown>, secret: string): string {
  const text = JSON.stringify(entry);
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}

export async function prepareLocalChatRoute(input: {
  mode: "local" | "remote" | "ssh";
  model: string;
  provider?: string;
  baseUrl?: string;
  providerRef?: string;
  source: "session" | "active-model";
  registry: readonly RegistryProviderView[];
  legacyRegistry: readonly LegacyRegistryRecord[];
  builtinSlugs?: readonly string[];
  projectionOk: boolean;
  secretValue?: string;
  wroteProjection?: boolean;
  gatewayLoadedProjection?: boolean;
  fillProjection?: () => Promise<{ wrote: boolean }>;
  restart?: () => Promise<boolean>;
}): Promise<LocalChatRouteResult> {
  if (input.mode !== "local") return { ok: true, action: "passthrough" };
  if (!needsCanonicalRoute(input.provider, input.providerRef)) {
    return { ok: true, action: "passthrough" };
  }

  let providerRef = input.providerRef;
  if (!providerRef) {
    const matched = matchLegacyProvider({
      provider: input.provider || "",
      baseUrl: input.baseUrl,
      registry: input.legacyRegistry,
      builtinSlugs: input.builtinSlugs,
    });
    if (!matched.ok) {
      return {
        ok: false,
        requests: 0,
        error:
          matched.error === "PROVIDER_IDENTITY_AMBIGUOUS"
            ? "PROVIDER_IDENTITY_AMBIGUOUS"
            : input.source === "active-model"
              ? "ACTIVE_MODEL_PROVIDER_UNRESOLVED"
              : "SESSION_PROVIDER_UNRESOLVED",
      };
    }
    providerRef = matched.providerRef;
  }

  const unresolved: LocalChatRouteResult = {
    ok: false,
    requests: 0,
    error: "PROVIDER_ROUTE_UNRESOLVED",
  };
  const preview = resolveRuntimeProvider({
    providerRef,
    model: input.model,
    registry: input.registry,
    baseUrl: input.baseUrl,
    source: input.providerRef ? "canonical" : "migrated-legacy",
  });
  if (!preview.ok) return unresolved;
  if (
    preview.route.hermesProvider === "custom" ||
    preview.route.hermesProvider.startsWith("custom:")
  ) {
    return unresolved;
  }

  if (preview.route.keyEnv && !(input.secretValue || "").trim()) {
    return { ok: false, requests: 0, error: "PROVIDER_SECRET_MISSING" };
  }

  let wrote = input.wroteProjection === true;
  if (!input.projectionOk) {
    if (!input.fillProjection) {
      return { ok: false, requests: 0, error: "PROVIDER_PROJECTION_DRIFT" };
    }
    const filled = await input.fillProjection();
    wrote = filled.wrote || wrote;
  }

  if (wrote && !input.gatewayLoadedProjection) {
    const restarted = input.restart ? await input.restart() : false;
    if (!restarted) {
      return { ok: false, requests: 0, error: "PROVIDER_RUNTIME_RELOAD_FAILED" };
    }
  }

  return {
    ok: true,
    action: "send",
    hermesProvider: preview.route.hermesProvider,
    providerRef: preview.route.providerRef,
    strategy: preview.route.strategy,
    requests: 1,
  };
}

export async function routeDesktopSend(input: {
  mode: "local" | "remote" | "ssh";
  profile?: string;
  model: string;
  provider?: string;
  baseUrl?: string;
  providerRef?: string;
  source: "session" | "active-model";
}): Promise<LocalChatRouteResult> {
  if (
    input.mode !== "local" ||
    !needsCanonicalRoute(input.provider, input.providerRef)
  ) {
    return { ok: true, action: "passthrough" };
  }
  const { readProviderRegistry } = await import("../providers-store");
  const { checkProviderProjection, listAgentUserProviders } = await import(
    "../agent-config-providers"
  );
  const { readEnv } = await import("../config");
  const profile =
    input.profile && input.profile !== "default" ? input.profile : undefined;
  const file = readProviderRegistry(profile);
  const legacyRegistry = file.providers.flatMap((row) =>
    row.providerKey
      ? [{ providerKey: row.providerKey, name: row.name, baseUrl: row.baseUrl }]
      : [],
  );
  const registry: RegistryProviderView[] = file.providers.flatMap((row) =>
    row.providerKey
      ? [
          {
            providerKey: row.providerKey,
            baseUrl: row.baseUrl,
            keyEnv: row.keyEnv || "",
            apiMode: row.apiMode || "chat_completions",
          },
        ]
      : [],
  );

  let providerRef = input.providerRef;
  if (!providerRef) {
    const matched = matchLegacyProvider({
      provider: input.provider || "",
      baseUrl: input.baseUrl,
      registry: legacyRegistry,
    });
    if (!matched.ok) {
      return {
        ok: false,
        requests: 0,
        error:
          matched.error === "PROVIDER_IDENTITY_AMBIGUOUS"
            ? "PROVIDER_IDENTITY_AMBIGUOUS"
            : input.source === "active-model"
              ? "ACTIVE_MODEL_PROVIDER_UNRESOLVED"
              : "SESSION_PROVIDER_UNRESOLVED",
      };
    }
    providerRef = matched.providerRef;
  }

  const providerKey = providerRef.startsWith("named:")
    ? providerRef.slice("named:".length)
    : "";
  const record = registry.find((row) => row.providerKey === providerKey);
  const projected = providerKey
    ? listAgentUserProviders(profile).find((entry) => entry.slug === providerKey)
    : undefined;
  if (
    record &&
    projected &&
    !checkProviderProjection(profile, {
      providerKey: record.providerKey,
      baseUrl: record.baseUrl,
      keyEnv: record.keyEnv,
      apiMode: record.apiMode,
    }).ok
  ) {
    return { ok: false, requests: 0, error: "PROVIDER_PROJECTION_DRIFT" };
  }
  const projectionOk = !record || (!!projected && !!record);
  const secretValue = record?.keyEnv
    ? readEnv(profile)[record.keyEnv] || ""
    : undefined;

  return prepareLocalChatRoute({
    mode: "local",
    model: input.model,
    provider: input.provider,
    baseUrl: input.baseUrl,
    providerRef,
    source: input.source,
    registry,
    legacyRegistry,
    projectionOk,
    secretValue,
    restart: async () => {
      const { getRuntimeManager } = await import("../runtime/runtime-manager");
      const restarted = await getRuntimeManager().restart(profile);
      return restarted.ok;
    },
    fillProjection:
      record && !projectionOk
        ? async () => {
            const { saveNamedProvider } = await import(
              "./provider-save-transaction"
            );
            const saved = saveNamedProvider({
              profile: input.profile || "default",
              id: file.providers.find((row) => row.providerKey === providerKey)
                ?.id,
              name:
                file.providers.find((row) => row.providerKey === providerKey)
                  ?.name || providerKey,
              baseUrl: record.baseUrl,
              apiMode: record.apiMode,
              keyEnv: record.keyEnv,
            });
            return { wrote: saved.ok };
          }
        : undefined,
  });
}

