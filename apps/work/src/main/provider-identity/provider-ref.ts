export type ApiMode = "chat_completions" | "anthropic_messages";

export type NamedOrBuiltin = "named" | "builtin";

const KEY_UNSAFE = /[^a-z0-9._-]+/g;

export function providerRef(kind: NamedOrBuiltin, id: string): string {
  return `${kind}:${id}`;
}

export function parseProviderRef(
  value: string,
): { kind: NamedOrBuiltin; id: string } | null {
  const trimmed = value.trim();
  const splitAt = trimmed.indexOf(":");
  if (splitAt <= 0) return null;
  const kind = trimmed.slice(0, splitAt);
  const id = trimmed.slice(splitAt + 1);
  if ((kind !== "named" && kind !== "builtin") || !id || id.includes(":")) {
    return null;
  }
  return { kind, id };
}

export function providerKeyEnv(providerKey: string): string {
  const suffix = providerKey.toUpperCase().replace(/[.\-]/g, "_");
  return `PROVIDER_${suffix}_API_KEY`;
}

export type ProviderKeyResult =
  | { ok: true; providerKey: string }
  | { ok: false; error: "PROVIDER_KEY_CONFLICT" };

/**
 * providerKey from display name. Once returned, callers must persist it and
 * never regenerate it when the display name changes.
 */
export function generateProviderKey(
  name: string,
  recordId: string,
  existingKeys: readonly string[],
): ProviderKeyResult {
  const normalized = name.normalize("NFKC").trim().toLowerCase();
  let key = normalized.replace(/\s+/g, "-").replace(KEY_UNSAFE, "-");
  key = key.replace(/-+/g, "-").replace(/^[._-]+|[._-]+$/g, "");
  if (key.length > 64) key = key.slice(0, 64).replace(/[._-]+$/g, "");
  if (!key) {
    const hex = recordId.replace(/[^a-fA-F0-9]/g, "").slice(0, 12).toLowerCase();
    key = `custom-${hex.padEnd(12, "0")}`;
  }
  if (existingKeys.includes(key)) {
    return { ok: false, error: "PROVIDER_KEY_CONFLICT" };
  }
  return { ok: true, providerKey: key };
}
