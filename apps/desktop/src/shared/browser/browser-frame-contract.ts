/** v5.7 — Frame tree DTOs for WebContentsView browser core. */

export interface BrowserRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserFrameSnapshot {
  frameId: string;
  parentFrameId?: string;
  url: string;
  origin: string;
  name?: string;
  title?: string;
  depth: number;
  path: number[];
  sameOriginWithParent: boolean;
  childCount: number;
}

export interface BrowserFrameTarget {
  frameId?: string;
  framePath?: number[];
  urlIncludes?: string;
  name?: string;
  title?: string;
  index?: number;
}

export interface BrowserFrameHtmlRequest extends BrowserFrameTarget {
  selector?: string;
  /** When selector is provided: outerHTML (default true) or innerHTML (false). */
  outer?: boolean;
  /** Max HTML length returned. Default is decided by the caller. */
  maxLength?: number;
}

export interface BrowserFrameHtmlResult {
  ok: boolean;
  frameId?: string;
  url?: string;
  title?: string;
  selector?: string;
  html?: string;
  text?: string;
  capturedAt: string;
  truncated?: boolean;
  source?: "frame-document" | "parent-srcdoc";
  error?: {
    code:
      | "WEB_CONTENTS_NOT_READY"
      | "FRAME_NOT_FOUND"
      | "FRAME_SCRIPT_BLOCKED"
      | "ELEMENT_NOT_FOUND"
      | "UNKNOWN_BROWSER_ERROR";
    message: string;
  };
}
