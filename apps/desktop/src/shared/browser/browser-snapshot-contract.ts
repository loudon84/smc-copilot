/** v5.7 — DOM snapshot DTOs for WebContentsView browser core. */

import type { BrowserFrameSnapshot, BrowserRect } from "./browser-frame-contract";
import type { BrowserFrameTarget } from "./browser-frame-contract";

export interface BrowserSnapshotError {
  frameId: string;
  code: "FRAME_SCRIPT_BLOCKED" | "FRAME_NOT_FOUND" | "SNAPSHOT_FAILED";
  message: string;
}

export interface BrowserElementSnapshot {
  elementId: string;
  frameId: string;
  tagName: string;
  role?: string;
  text?: string;
  selector?: string;
  ariaLabel?: string;
  placeholder?: string;
  href?: string;
  inputType?: string;
  valuePreview?: string;
  rect: BrowserRect;
  rectInMainFrame: BrowserRect;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
}

export interface BrowserPageSnapshot {
  capturedAt: string;
  url: string;
  title: string;
  loading: boolean;
  frames: BrowserFrameSnapshot[];
  elements: BrowserElementSnapshot[];
  activeFrameId?: string;
  errors: BrowserSnapshotError[];
}

export interface BrowserSnapshotOptions {
  includeFrames?: boolean;
  includeInteractiveElements?: boolean;
}

export interface BrowserElementTarget {
  elementId?: string;
  selector?: string;
  text?: string;
  role?: string;
  ariaLabel?: string;
  placeholder?: string;
  hrefIncludes?: string;
  frame?: BrowserFrameTarget;
}
