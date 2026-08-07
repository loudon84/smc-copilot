/** v5.7 — Structured browser action DTOs for WebContentsView browser core. */

import type { BrowserRect } from "./browser-frame-contract";
import type { BrowserElementTarget } from "./browser-snapshot-contract";

export type BrowserActionType =
  | "open"
  | "reload"
  | "back"
  | "forward"
  | "getState"
  | "listFrames"
  | "snapshot"
  | "findElement"
  | "clickElement"
  | "typeElement"
  | "selectOption"
  | "scroll"
  | "getFrameHtml"
  | "screenshot";

export type BrowserActionErrorCode =
  | "WEB_CONTENTS_NOT_READY"
  | "PAGE_NOT_LOADED"
  | "FRAME_NOT_FOUND"
  | "FRAME_SCRIPT_BLOCKED"
  | "ELEMENT_NOT_FOUND"
  | "ELEMENT_NOT_VISIBLE"
  | "ELEMENT_DISABLED"
  | "ELEMENT_NOT_EDITABLE"
  | "ELEMENT_NOT_CLICKABLE"
  | "OPTION_NOT_FOUND"
  | "SCREENSHOT_FAILED"
  | "NAVIGATION_FAILED"
  | "UNKNOWN_BROWSER_ERROR";

export interface BrowserActionError {
  code: BrowserActionErrorCode;
  message: string;
  detail?: unknown;
}

export interface BrowserStructuredActionResult {
  ok: boolean;
  action: BrowserActionType;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  url?: string;
  title?: string;
  frameId?: string;
  selector?: string;
  target?: BrowserElementTarget;
  rect?: BrowserRect;
  screenshotId?: string;
  error?: BrowserActionError;
}

export interface BrowserActionLogEntry {
  id: string;
  action: BrowserActionType;
  params: unknown;
  result: BrowserStructuredActionResult;
  createdAt: string;
}

export interface BrowserRuntimeState {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  lastUpdatedAt: string;
  frameCount: number;
}

export interface BrowserTypeOptions {
  clear?: boolean;
  delayMs?: number;
}

export interface BrowserScrollOptions {
  x?: number;
  y?: number;
  target?: BrowserElementTarget;
}

export interface BrowserScreenshotOptions {
  /** Viewport screenshot when no target rect. */
  viewport?: boolean;
  /** Element target for region screenshot. */
  target?: BrowserElementTarget;
  /** Return base64 in response (default true). */
  base64?: boolean;
  /** Persist to profile web-operator dir. */
  persist?: boolean;
}

export interface BrowserStructuredScreenshotResult {
  screenshotId: string;
  mimeType: "image/png";
  width: number;
  height: number;
  base64?: string;
  filePath?: string;
  capturedAt: string;
}

export const BrowserV57Events = {
  STATE_CHANGED: "browser:state-changed",
  ACTION_LOGGED: "browser:action-logged",
} as const;
