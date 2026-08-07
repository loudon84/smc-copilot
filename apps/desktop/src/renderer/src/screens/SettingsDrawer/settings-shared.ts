export function makeApiKeyMask(length: number): string {
  const n = Math.min(Math.max(length, 8), 128);
  return "*".repeat(n);
}

export function getCachedVersion(): string | null {
  try {
    return localStorage.getItem("hermes-version-cache");
  } catch {
    return null;
  }
}

export function getCachedOpenClaw(): { found: boolean; path: string | null } | null {
  try {
    const raw = localStorage.getItem("hermes-openclaw-cache");
    return raw ? (JSON.parse(raw) as { found: boolean; path: string | null }) : null;
  } catch {
    return null;
  }
}
