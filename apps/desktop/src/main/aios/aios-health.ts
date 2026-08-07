const HEALTH_TIMEOUT_MS = 3000;

export async function fetchHttpStatus(url: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    return res.status;
  } catch {
    return null;
  }
}

/** Strict probe for /health endpoints — requires HTTP 2xx. */
export async function checkServiceHealth(url: string): Promise<boolean> {
  const status = await fetchHttpStatus(url);
  return status !== null && status >= 200 && status < 300;
}

function isPortalHealthyStatus(status: number): boolean {
  // 2xx/3xx: page loads; 4xx: server up (e.g. auth wall)
  return status >= 200 && status < 500;
}

/**
 * Portal reachability for login-configured aiosHomeUrl.
 * Tries the configured URL first, then same-origin fallbacks (e.g. /zh when / returns 500).
 */
export function buildPortalHealthCandidates(homeUrl: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string): void => {
    const normalized = raw.replace(/\/+$/, "") || raw;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  try {
    const parsed = new URL(homeUrl);
    add(homeUrl);
    const atRoot = parsed.pathname === "" || parsed.pathname === "/";
    const atZhOnly = parsed.pathname === "/zh" || parsed.pathname === "/zh/";
    // Deep paths (e.g. /zh/dashboard) must not fall back to /zh — that drops the user path.
    if (atRoot) {
      add(`${parsed.origin}/zh`);
      add(parsed.origin);
    } else if (atZhOnly) {
      add(parsed.origin);
    }
  } catch {
    add(homeUrl);
  }

  return out;
}

export async function checkPortalHealth(homeUrl: string): Promise<boolean> {
  const candidates = buildPortalHealthCandidates(homeUrl);
  let sawHttpResponse = false;

  for (const url of candidates) {
    const status = await fetchHttpStatus(url);
    if (status === null) continue;
    sawHttpResponse = true;
    if (isPortalHealthyStatus(status)) return true;
  }

  return sawHttpResponse;
}

export async function waitForHealth(
  url: string,
  timeoutMs: number = 60_000,
  intervalMs: number = 2000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkServiceHealth(url)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
