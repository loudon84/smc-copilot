/** Treat localhost and 127.0.0.1 as the same host for portal origin checks. */
export function normalizePortalHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (lower === "localhost") {
    return "127.0.0.1";
  }
  return lower;
}

export function portalOriginsMatch(urlA: string, urlB: string): boolean {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    return (
      a.protocol === b.protocol &&
      a.port === b.port &&
      normalizePortalHostname(a.hostname) === normalizePortalHostname(b.hostname)
    );
  } catch {
    return false;
  }
}

export function normalizePortalPath(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * When refreshing aios-home, keep in-app navigation (e.g. /zh/login) on tab switch.
 * Only force reload for blank/error, lifecycle states, or cross-origin drift.
 */
export function shouldForceReloadAiosHome(
  currentUrl: string,
  configuredUrl: string,
  state: string,
): boolean {
  if (
    !currentUrl ||
    currentUrl === "about:blank" ||
    currentUrl.startsWith("chrome-error://")
  ) {
    return true;
  }

  if (state === "creating" || state === "loading" || state === "destroyed") {
    return true;
  }

  if (!portalOriginsMatch(currentUrl, configuredUrl)) {
    return true;
  }

  // Same origin (incl. localhost vs 127.0.0.1): preserve SPA route (/zh/login, /zh/dashboard).
  return false;
}
