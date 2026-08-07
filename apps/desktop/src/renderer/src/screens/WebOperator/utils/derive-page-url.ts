import type {
  BrowserFrameHtmlResult,
  BrowserFrameSnapshot,
} from "../../../../../shared/browser/browser-frame-contract";

const ABOUT_BLANK_LIKE = /^(about:blank|about:srcdoc)$/i;

function isPathPrefix(parentPath: number[], childPath: number[]): boolean {
  if (parentPath.length !== childPath.length - 1) return false;
  for (let i = 0; i < parentPath.length; i++) {
    if (parentPath[i] !== childPath[i]) return false;
  }
  return true;
}

function findParentFrame(
  frame: BrowserFrameSnapshot,
  frames: BrowserFrameSnapshot[],
): BrowserFrameSnapshot | null {
  for (const candidate of frames) {
    if (candidate.frameId === frame.frameId) continue;
    if (isPathPrefix(candidate.path, frame.path)) {
      return candidate;
    }
  }
  return null;
}

function appendFrameFragment(parentUrl: string, frame: BrowserFrameSnapshot): string {
  const title = frame.title || frame.name || "";
  const pathStr = frame.path.join(".");
  const hash = `framePath=${encodeURIComponent(pathStr)}&frameTitle=${encodeURIComponent(title)}`;
  try {
    const u = new URL(parentUrl);
    u.hash = hash;
    return u.toString();
  } catch {
    return `${parentUrl}#${hash}`;
  }
}

/**
 * Stable page URL for task_session binding (iframe about:srcdoc uses parent + fragment).
 */
export function derivePageUrl(input: {
  frame: BrowserFrameSnapshot | null;
  frames: BrowserFrameSnapshot[];
  result: BrowserFrameHtmlResult;
}): string {
  const { frame, frames, result } = input;
  if (!frame) {
    return result.url?.trim() || "unknown://web-operator-frame/unknown";
  }

  const rawUrl = (frame.url ?? result.url ?? "").trim();

  if (rawUrl && !ABOUT_BLANK_LIKE.test(rawUrl)) {
    try {
      const u = new URL(rawUrl);
      return `${u.origin}${u.pathname}${u.search}`;
    } catch {
      return rawUrl;
    }
  }

  const parent = findParentFrame(frame, frames);
  if (parent?.url && !ABOUT_BLANK_LIKE.test(parent.url.trim())) {
    try {
      const u = new URL(parent.url.trim());
      const base = `${u.origin}${u.pathname}${u.search}`;
      return appendFrameFragment(base, frame);
    } catch {
      return appendFrameFragment(parent.url.trim(), frame);
    }
  }

  const fallback = result.url?.trim() || frame.url?.trim();
  if (fallback && !ABOUT_BLANK_LIKE.test(fallback)) {
    return fallback;
  }

  return `unknown://web-operator-frame/${frame.frameId}`;
}
