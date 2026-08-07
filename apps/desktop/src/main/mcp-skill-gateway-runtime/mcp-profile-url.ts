/** v6.7 — Profile-scoped local MCP proxy URL helpers. */

export const DEFAULT_MCP_PROXY_PROFILE = "default";
export const MCP_PROXY_PATH = "/mcp";

export function parseProfileFromMcpUrl(url: string | null | undefined): string {
  if (!url?.trim()) return DEFAULT_MCP_PROXY_PROFILE;
  try {
    const parsed = new URL(url);
    const profile = parsed.searchParams.get("profile")?.trim();
    return profile || DEFAULT_MCP_PROXY_PROFILE;
  } catch {
    return DEFAULT_MCP_PROXY_PROFILE;
  }
}

export function buildProfileScopedMcpUrl(
  port: number,
  options?: { profile?: string; profileScoped?: boolean },
): string {
  const base = `http://127.0.0.1:${port}${MCP_PROXY_PATH}`;
  if (options?.profileScoped === false) {
    return base;
  }
  const profile = options?.profile?.trim() || DEFAULT_MCP_PROXY_PROFILE;
  return `${base}?profile=${encodeURIComponent(profile)}`;
}

/** Compare registered URL against expected; legacy URLs without ?profile match default profile. */
export function mcpRegistrationUrlsMatch(
  actualUrl: string | null,
  expectedUrl: string,
  profile: string,
): boolean {
  if (!actualUrl) return false;
  if (actualUrl === expectedUrl) return true;

  const actualProfile = parseProfileFromMcpUrl(actualUrl);
  const expectedProfile = parseProfileFromMcpUrl(expectedUrl);
  if (actualProfile !== expectedProfile && profile !== DEFAULT_MCP_PROXY_PROFILE) {
    return false;
  }

  try {
    const actual = new URL(actualUrl);
    const expected = new URL(expectedUrl);
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) {
      return false;
    }
    const actualHasProfile = actual.searchParams.has("profile");
    const expectedHasProfile = expected.searchParams.has("profile");
    if (!actualHasProfile && expectedHasProfile && profile === DEFAULT_MCP_PROXY_PROFILE) {
      return true;
    }
    return actualProfile === expectedProfile;
  } catch {
    return false;
  }
}
