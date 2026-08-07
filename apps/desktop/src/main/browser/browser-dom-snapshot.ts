import { randomUUID } from "crypto";
import type { WebContents } from "electron";
import type {
  BrowserElementSnapshot,
  BrowserPageSnapshot,
  BrowserSnapshotOptions,
  BrowserSnapshotError,
} from "../../shared/browser/browser-snapshot-contract";
import type { BrowserFrameSnapshot } from "../../shared/browser/browser-frame-contract";
import { BrowserFrameInspector } from "./browser-frame-inspector";
import { BrowserCoordinateResolver } from "./browser-coordinate-resolver";

const COLLECT_INTERACTIVE_SCRIPT = `
(function __collect_interactive__() {
  var selector = 'a[href], button, input, textarea, select, [role], [aria-label], [contenteditable="true"], input[type="submit"], input[type="button"]';
  var nodes = Array.from(document.querySelectorAll(selector)).slice(0, 200);
  return nodes.map(function(el, i) {
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    var visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    var tag = el.tagName.toLowerCase();
    var selectorHint = el.id ? '#' + el.id : (el.name ? '[name="' + el.name + '"]' : undefined);
    var text = (el.textContent || '').trim().slice(0, 120) || undefined;
    return {
      localIndex: i,
      tagName: tag,
      role: el.getAttribute('role') || undefined,
      text: text,
      selector: selectorHint,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      placeholder: el.placeholder || undefined,
      href: el.href || undefined,
      inputType: el.type || undefined,
      valuePreview: el.value ? String(el.value).slice(0, 40) : undefined,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visible: visible,
      enabled: !el.disabled,
      editable: !el.readOnly && (tag === 'input' || tag === 'textarea' || el.isContentEditable)
    };
  });
})()
`;

interface RawCollectedElement {
  localIndex: number;
  tagName: string;
  role?: string;
  text?: string;
  selector?: string;
  ariaLabel?: string;
  placeholder?: string;
  href?: string;
  inputType?: string;
  valuePreview?: string;
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  enabled: boolean;
  editable: boolean;
}

export class BrowserDomSnapshot {
  constructor(
    private readonly frameInspector: BrowserFrameInspector,
    private readonly coordinateResolver: BrowserCoordinateResolver,
  ) {}

  async capture(
    webContents: WebContents,
    options?: BrowserSnapshotOptions,
  ): Promise<BrowserPageSnapshot> {
    const includeFrames = options?.includeFrames !== false;
    const includeElements = options?.includeInteractiveElements !== false;
    const capturedAt = new Date().toISOString();
    const errors: BrowserSnapshotError[] = [];
    const elements: BrowserElementSnapshot[] = [];

    let frames: BrowserFrameSnapshot[] = [];
    if (includeFrames) {
      frames = this.frameInspector.listFrames(webContents);
    } else {
      frames = this.frameInspector.listFrames(webContents).filter((f) => f.depth === 0);
    }

    const url = webContents.getURL();
    const title = webContents.getTitle();
    const loading = webContents.isLoading();

    if (!includeElements) {
      return {
        capturedAt,
        url,
        title,
        loading,
        frames,
        elements: [],
        activeFrameId: frames[0]?.frameId,
        errors,
      };
    }

    for (const frameMeta of frames) {
      const frame = this.frameInspector.resolveFrameByPath(webContents, frameMeta.path);
      if (!frame) {
        errors.push({
          frameId: frameMeta.frameId,
          code: "FRAME_NOT_FOUND",
          message: "Frame not found for path",
        });
        continue;
      }

      try {
        const raw = (await frame.executeJavaScript(
          COLLECT_INTERACTIVE_SCRIPT,
        )) as RawCollectedElement[];

        for (const item of raw) {
          const rectInMainFrame = await this.coordinateResolver.toMainFrameRect(
            webContents,
            frameMeta.path,
            item.rect,
          );
          elements.push({
            elementId: `${frameMeta.frameId}:el-${item.localIndex}`,
            frameId: frameMeta.frameId,
            tagName: item.tagName,
            role: item.role,
            text: item.text,
            selector: item.selector,
            ariaLabel: item.ariaLabel,
            placeholder: item.placeholder,
            href: item.href,
            inputType: item.inputType,
            valuePreview: item.valuePreview,
            rect: item.rect,
            rectInMainFrame,
            visible: item.visible,
            enabled: item.enabled,
            editable: item.editable,
          });
        }
      } catch (err) {
        errors.push({
          frameId: frameMeta.frameId,
          code: "FRAME_SCRIPT_BLOCKED",
          message: (err as Error).message,
        });
      }
    }

    return {
      capturedAt,
      url,
      title,
      loading,
      frames,
      elements,
      activeFrameId: frames[0]?.frameId,
      errors,
    };
  }

  newElementId(): string {
    return `el-${randomUUID().slice(0, 8)}`;
  }
}
