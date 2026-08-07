import type { BrowserErrorCode, BrowserActionResult } from "./browser-contract";

interface BrowserErrorDefinition {
  code: BrowserErrorCode;
  message: string;
  httpStatus: number;
}

export const BrowserErrorCodes: Record<BrowserErrorCode, BrowserErrorDefinition> = {
  EXTERNAL_WEB_VIEW_NOT_READY: {
    code: "EXTERNAL_WEB_VIEW_NOT_READY",
    message: "External web view is not ready or has been destroyed",
    httpStatus: 503
  },
  DOMAIN_NOT_ALLOWED: {
    code: "DOMAIN_NOT_ALLOWED",
    message: "The requested domain is not in the allowlist",
    httpStatus: 403
  },
  SELECTOR_NOT_FOUND: {
    code: "SELECTOR_NOT_FOUND",
    message: "No element found matching the given selector",
    httpStatus: 404
  },
  PASSWORD_FIELD_BLOCKED: {
    code: "PASSWORD_FIELD_BLOCKED",
    message: "Typing into password fields is blocked for security",
    httpStatus: 403
  },
  UNSAFE_ACTION_REQUIRES_CONFIRMATION: {
    code: "UNSAFE_ACTION_REQUIRES_CONFIRMATION",
    message: "This action is sensitive and requires user confirmation",
    httpStatus: 202
  },
  JAVASCRIPT_EXECUTION_FAILED: {
    code: "JAVASCRIPT_EXECUTION_FAILED",
    message: "JavaScript execution in the web page failed",
    httpStatus: 500
  },
  SCREENSHOT_FAILED: {
    code: "SCREENSHOT_FAILED",
    message: "Screenshot capture failed",
    httpStatus: 500
  }
};

export function createBrowserError(
  errorCode: BrowserErrorCode,
  overrides?: { message?: string }
): BrowserActionResult {
  const def = BrowserErrorCodes[errorCode];
  return {
    ok: false,
    errorCode,
    message: overrides?.message ?? def.message
  };
}
