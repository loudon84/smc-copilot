import type { WebContents } from "electron";
import type { BrowserElementSnapshot } from "../../shared/browser/browser-snapshot-contract";
import type { BrowserElementTarget } from "../../shared/browser/browser-snapshot-contract";
import { BrowserDomSnapshot } from "./browser-dom-snapshot";

function scoreElement(
  el: BrowserElementSnapshot,
  target: BrowserElementTarget,
): number {
  if (target.elementId && el.elementId === target.elementId) return 1000;
  if (target.selector && el.selector === target.selector) return 900;
  if (target.selector && el.selector?.includes(target.selector)) return 850;
  if (target.role && target.text && el.role === target.role && el.text?.includes(target.text))
    return 800;
  if (target.ariaLabel && el.ariaLabel === target.ariaLabel) return 750;
  if (target.placeholder && el.placeholder === target.placeholder) return 700;
  if (target.text && el.text?.includes(target.text)) return 650;
  if (target.hrefIncludes && el.href?.includes(target.hrefIncludes)) return 600;
  if (target.role && el.role === target.role) return 500;
  return -1;
}

export class BrowserElementLocator {
  constructor(private readonly domSnapshot: BrowserDomSnapshot) {}

  async findElement(
    webContents: WebContents,
    target: BrowserElementTarget,
    cachedElements?: BrowserElementSnapshot[],
  ): Promise<BrowserElementSnapshot | null> {
    const elements =
      cachedElements ??
      (await this.domSnapshot.capture(webContents, { includeFrames: true })).elements;

    let candidates = elements;

    if (target.frame?.frameId) {
      candidates = candidates.filter((e) => e.frameId === target.frame!.frameId);
    } else if (target.frame?.framePath) {
      const snapshot = await this.domSnapshot.capture(webContents, {
        includeFrames: true,
        includeInteractiveElements: false,
      });
      const frameMeta = snapshot.frames.find(
        (f) => JSON.stringify(f.path) === JSON.stringify(target.frame!.framePath),
      );
      if (frameMeta) {
        candidates = candidates.filter((e) => e.frameId === frameMeta.frameId);
      }
    }

    let best: BrowserElementSnapshot | null = null;
    let bestScore = -1;

    for (const el of candidates) {
      const s = scoreElement(el, target);
      if (s < 0) continue;
      if (!el.visible || !el.enabled) {
        if (s >= bestScore) continue;
      }
      if (s > bestScore || (s === bestScore && el.visible && el.enabled)) {
        bestScore = s;
        best = el;
      }
    }

    if (best && best.visible && best.enabled) return best;

    for (const el of candidates) {
      const s = scoreElement(el, target);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }

    return bestScore >= 0 ? best : null;
  }
}
