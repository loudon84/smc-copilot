import type { BrowserFrameHtmlResult, BrowserFrameSnapshot } from "../../../../../shared/browser/browser-frame-contract";
import type { HostBridgeStoredEvent } from "../../../../../shared/crm-bridge";
import type { HermesPanelPageContext } from "../../../components/hermes";

export function buildScopeKey(url: string, frameId: string | null): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}#${frameId ?? "main"}`;
  } catch {
    return `${url}#${frameId ?? "main"}`;
  }
}

export function buildPageContextFromFrameHtml(input: {
  frame: BrowserFrameSnapshot | null;
  result: BrowserFrameHtmlResult;
  htmlExcerpt: string;
  /** Stable task URL (e.g. parent + fragment for about:srcdoc iframes). */
  pageUrl?: string;
}): HermesPanelPageContext | null {
  const { frame, result, htmlExcerpt, pageUrl: pageUrlOverride } = input;
  if (!result.ok || !frame) return null;

  const url = pageUrlOverride?.trim() || (frame.url ?? result.url ?? "");
  const title = frame.title ?? result.title ?? "";
  const frameId = result.frameId ?? frame.frameId;
  const scopeKey = buildScopeKey(url, frameId);
  const summary =
    result.text?.trim() || `${title || "（无标题）"} · ${frame.origin ?? url}`;

  return {
    type: "web-operator",
    scopeKey,
    summary,
    payload: {
      url,
      title,
      frameId,
      frameMeta: {
        name: frame.name ?? null,
        origin: frame.origin ?? null,
        path: frame.path.length ? frame.path.join(".") : null,
        url: frame.url ?? null,
      },
      htmlExcerpt,
      textExcerpt: result.text ?? undefined,
      truncated: result.truncated,
      capturedAt: result.capturedAt,
    },
  };
}

export function resolveHostBridgePageUrl(event: HostBridgeStoredEvent): string {
  return event.pageContext.url.trim() || event.callbackUrl?.trim() || "";
}

function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function buildPageContextFromHostBridgeEvent(
  event: HostBridgeStoredEvent,
): HermesPanelPageContext {
  const pageContext = event.pageContext;
  const url = resolveHostBridgePageUrl(event);
  const title = pageContext.title ?? pageContext.entityName ?? "";
  const scopeKey = buildScopeKey(url || "host-bridge", `host-bridge:${event.requestId}`);

  const summaryParts = [
    event.formType,
    event.action,
    title || pageContext.entityName || pageContext.app,
  ].filter(Boolean);
  const summary = summaryParts.join(" · ") || url || "HostBridge 上下文";

  let textExcerpt = pageContext.safeText?.trim() ?? "";
  if (!textExcerpt) {
    const structured: Record<string, unknown> = {};
    if (pageContext.fields) structured.fields = pageContext.fields;
    if (pageContext.data) structured.data = pageContext.data;
    if (pageContext.entityType) structured.entityType = pageContext.entityType;
    if (pageContext.entityId) structured.entityId = pageContext.entityId;
    if (Object.keys(structured).length > 0) {
      textExcerpt = jsonStringifySafe(structured);
    }
  }

  return {
    type: "web-operator",
    scopeKey,
    summary,
    payload: {
      url: url || pageContext.url,
      title,
      frameId: null,
      frameMeta: {
        name: pageContext.app ?? event.formType ?? null,
        origin: event.action ?? null,
        path: event.requestId ?? null,
        url: event.callbackUrl ?? pageContext.url ?? null,
      },
      htmlExcerpt: jsonStringifySafe(event),
      textExcerpt: textExcerpt || undefined,
      capturedAt: event.createdAt || event.trigger.timestamp,
    },
  };
}
