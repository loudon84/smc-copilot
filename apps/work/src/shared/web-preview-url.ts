/**
 * Renderer + Main shared rules for Chat Web Preview (<webview partition=web-preview>).
 * Must stay aligned with apps/work/src/main/security.ts#isAllowedWebviewUrl(..., true).
 */

const LOCAL_WEBVIEW_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const ATTACHMENT_EXT =
  /\.(docx?|xlsx?|pptx?|pdf|zip|7z|rar|tar|gz|tgz|csv|md|txt|json|png|jpe?g|gif|webp|mp4|mp3|wav)(\?|#|$)/i;

function parseUrl(rawUrl: unknown): URL | null {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/** Same allowlist as Main `isAllowedWebviewUrl(url, true)` for web-preview. */
export function isWebPreviewableUrl(rawUrl: unknown): boolean {
  if (
    typeof rawUrl === "string" &&
    (rawUrl === "about:blank" || rawUrl.startsWith("about:blank"))
  ) {
    return true;
  }

  const url = parseUrl(rawUrl);
  if (!url) return false;

  if (url.protocol === "http:") {
    if (!LOCAL_WEBVIEW_HOSTS.has(url.hostname)) return false;
    const port = Number(url.port);
    return Number.isInteger(port) && port >= 1024 && port <= 65535;
  }

  if (url.protocol === "https:") {
    return true;
  }

  return false;
}

/** Pre-signed / attachment downloads belong in the system browser, not <webview>. */
export function isLikelyAttachmentDownloadUrl(rawUrl: unknown): boolean {
  const url = parseUrl(rawUrl);
  if (!url) return false;
  const disposition =
    url.searchParams.get("response-content-disposition") ||
    url.searchParams.get("content-disposition") ||
    "";
  if (/attachment/i.test(disposition)) return true;
  if (ATTACHMENT_EXT.test(url.pathname)) return true;
  return false;
}

/**
 * True when Chat should call openExternal instead of opening Web Preview.
 * LAN HTTP (e.g. MinIO :9010) is blocked by webview security and must not mount.
 */
export function shouldOpenUrlExternally(rawUrl: unknown): boolean {
  if (!isWebPreviewableUrl(rawUrl)) return true;
  if (isLikelyAttachmentDownloadUrl(rawUrl)) return true;
  return false;
}
