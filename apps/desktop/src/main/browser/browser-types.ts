export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PendingSensitiveAction {
  pendingActionId: string;
  action: string;
  selector: string;
  elementDescription?: string;
  url: string;
  createdAt: string;
  expiresAt: string;
  originalParams: Record<string, unknown>;
}

export const SENSITIVE_ACTION_KEYWORDS = new Set([
  "submit",
  "approve",
  "reject",
  "delete",
  "remove",
  "payment",
  "transfer",
  "archive",
  "publish",
  "send"
]);

export const JS_SCRIPT_NAMES = new Set([
  "__get_page_state__",
  "__click_selector__",
  "__type_selector__",
  "__extract_table__"
]);

import { WEB_OPERATOR_PARTITION } from "../../shared/shell/browser-partitions";

/** @deprecated Use WEB_OPERATOR_PARTITION from shared/shell/browser-partitions */
export const BROWSER_PARTITION = WEB_OPERATOR_PARTITION;

export const PENDING_ACTION_TIMEOUT_MS = 5 * 60 * 1000;
