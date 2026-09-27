import { providerRef } from "./provider-ref";

export interface LegacyRegistryRecord {
  providerKey: string;
  name: string;
  baseUrl: string;
}

export type LegacyMatchResult =
  | { ok: true; providerRef: string }
  | {
      ok: false;
      error: "PROVIDER_IDENTITY_AMBIGUOUS" | "SESSION_PROVIDER_UNRESOLVED";
    };

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Migration-only identity recovery. Callers must not use this on the
 * Gateway or Dashboard send path.
 */
export function matchLegacyProvider(input: {
  provider: string;
  baseUrl?: string;
  providerLabel?: string;
  registry: readonly LegacyRegistryRecord[];
  builtinSlugs?: readonly string[];
}): LegacyMatchResult {
  const provider = input.provider.trim();
  const baseUrl = normalizeUrl(input.baseUrl || "");
  const label = (input.providerLabel || "").trim();

  if ((input.builtinSlugs ?? []).includes(provider)) {
    return { ok: true, providerRef: providerRef("builtin", provider) };
  }

  const byKey = input.registry.filter((record) => record.providerKey === provider);
  if (byKey.length === 1) {
    return { ok: true, providerRef: providerRef("named", byKey[0].providerKey) };
  }

  const legacyName = provider.startsWith("custom:")
    ? provider.slice("custom:".length)
    : label;
  if (legacyName) {
    const byName = input.registry.filter((record) => record.name === legacyName);
    if (byName.length === 1) {
      return {
        ok: true,
        providerRef: providerRef("named", byName[0].providerKey),
      };
    }
    if (byName.length > 1) {
      return { ok: false, error: "PROVIDER_IDENTITY_AMBIGUOUS" };
    }
  }

  if (provider === "custom" || provider.startsWith("custom:")) {
    const byUrl = input.registry.filter(
      (record) => normalizeUrl(record.baseUrl) === baseUrl && baseUrl,
    );
    if (byUrl.length === 1) {
      return { ok: true, providerRef: providerRef("named", byUrl[0].providerKey) };
    }
    if (byUrl.length > 1) {
      return { ok: false, error: "PROVIDER_IDENTITY_AMBIGUOUS" };
    }
    return { ok: false, error: "SESSION_PROVIDER_UNRESOLVED" };
  }

  return { ok: false, error: "SESSION_PROVIDER_UNRESOLVED" };
}
