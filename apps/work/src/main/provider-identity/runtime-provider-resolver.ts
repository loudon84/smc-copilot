import type { ApiMode } from "./provider-ref";
import { parseProviderRef } from "./provider-ref";

export type RouteStrategy = "builtin" | "named-config";

export interface RegistryProviderView {
  providerKey: string;
  baseUrl: string;
  keyEnv: string;
  apiMode: ApiMode;
}

export interface RuntimeProviderRoute {
  providerRef: string;
  hermesProvider: string;
  model: string;
  baseUrl: null;
  keyEnv: string | null;
  apiMode: ApiMode | null;
  strategy: RouteStrategy;
  source: "canonical" | "migrated-legacy";
}

export type ResolveRuntimeProviderResult =
  | { ok: true; route: RuntimeProviderRoute }
  | { ok: false; error: "PROVIDER_ROUTE_UNRESOLVED" };

export function resolveRuntimeProvider(input: {
  providerRef: string;
  model: string;
  registry: readonly RegistryProviderView[];
  baseUrl?: string;
  source?: "canonical" | "migrated-legacy";
}): ResolveRuntimeProviderResult {
  void input.baseUrl;
  const parsed = parseProviderRef(input.providerRef);
  if (!parsed) return { ok: false, error: "PROVIDER_ROUTE_UNRESOLVED" };

  if (parsed.kind === "builtin") {
    return {
      ok: true,
      route: {
        providerRef: input.providerRef,
        hermesProvider: parsed.id,
        model: input.model,
        baseUrl: null,
        keyEnv: null,
        apiMode: null,
        strategy: "builtin",
        source: input.source ?? "canonical",
      },
    };
  }

  const matches = input.registry.filter(
    (record) => record.providerKey === parsed.id,
  );
  if (matches.length !== 1) {
    return { ok: false, error: "PROVIDER_ROUTE_UNRESOLVED" };
  }
  const record = matches[0];
  return {
    ok: true,
    route: {
      providerRef: `named:${record.providerKey}`,
      hermesProvider: record.providerKey,
      model: input.model,
      baseUrl: null,
      keyEnv: record.keyEnv ? record.keyEnv : null,
      apiMode: record.apiMode,
      strategy: "named-config",
      source: input.source ?? "canonical",
    },
  };
}
