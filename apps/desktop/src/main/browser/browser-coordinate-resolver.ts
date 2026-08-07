import type { WebContents } from "electron";
import type { BrowserRect } from "../../shared/browser/browser-frame-contract";
import { BrowserFrameInspector } from "./browser-frame-inspector";

const IFRAME_OFFSET_SCRIPT = `
(function __iframe_offsets__(path) {
  var offsets = [];
  var win = window;
  for (var i = 0; i < path.length; i++) {
    var idx = path[i];
    var iframes = Array.from(document.querySelectorAll('iframe'));
    var frameEl = iframes[idx];
    if (!frameEl) return { ok: false, message: 'iframe not found at index ' + idx };
    var rect = frameEl.getBoundingClientRect();
    offsets.push({ x: rect.x, y: rect.y });
    try {
      win = frameEl.contentWindow;
      if (!win) return { ok: false, message: 'iframe contentWindow blocked' };
    } catch (e) {
      return { ok: false, message: 'cross-origin iframe' };
    }
  }
  return { ok: true, offsets: offsets };
})
`;

export class BrowserCoordinateResolver {
  constructor(private readonly frameInspector: BrowserFrameInspector) {}

  async toMainFrameRect(
    webContents: WebContents,
    framePath: number[],
    localRect: BrowserRect,
  ): Promise<BrowserRect> {
    if (framePath.length === 0) {
      return { ...localRect };
    }

    const main = webContents.mainFrame;
    let offsetX = 0;
    let offsetY = 0;

    try {
      const result = (await main.executeJavaScript(
        `(${IFRAME_OFFSET_SCRIPT})(${JSON.stringify(framePath)})`,
      )) as { ok: boolean; offsets?: Array<{ x: number; y: number }>; message?: string };

      if (result.ok && result.offsets) {
        for (const o of result.offsets) {
          offsetX += o.x;
          offsetY += o.y;
        }
      }
    } catch {
      // Cross-origin: fall back to frame-path resolution via WebFrameMain only
    }

    return {
      x: localRect.x + offsetX,
      y: localRect.y + offsetY,
      width: localRect.width,
      height: localRect.height,
    };
  }

  centerOf(rect: BrowserRect): { x: number; y: number } {
    return {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    };
  }
}
