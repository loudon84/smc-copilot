import { hermesPanelApi } from "../api/hermesPanelApi";
import type { HermesPanelPageContext } from "../types";

const MAX_HTML_CHARS = 100_000;

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

export type InjectWebContextResult =
  | { ok: true; attachmentIds: string[]; skipped?: boolean }
  | { ok: false; error: string };

export async function injectWebContextAttachments(
  sessionId: string,
  context: HermesPanelPageContext,
): Promise<InjectWebContextResult> {
  const html = context.payload.htmlExcerpt?.trim();
  const text = context.payload.textExcerpt?.trim();
  if (!html && !text) {
    return { ok: true, attachmentIds: [], skipped: true };
  }

  const files: Array<{ name: string; mime_type: string; data: number[] }> = [];

  if (html) {
    const body = html.length > MAX_HTML_CHARS ? `${html.slice(0, MAX_HTML_CHARS)}\n<!-- truncated -->` : html;
    files.push({
      name: "web-context/body.html",
      mime_type: "text/html",
      data: utf8Bytes(body),
    });
  } else if (text) {
    const body = text.length > MAX_HTML_CHARS ? `${text.slice(0, MAX_HTML_CHARS)}\n…` : text;
    files.push({
      name: "web-context/body.txt",
      mime_type: "text/plain",
      data: utf8Bytes(body),
    });
  }

  files.push({
    name: "web-context/meta.json",
    mime_type: "application/json",
    data: utf8Bytes(JSON.stringify(context.payload, null, 2)),
  });

  try {
    const res = await hermesPanelApi.uploadAttachmentBuffers({
      session_id: sessionId,
      files,
    });
    return {
      ok: true,
      attachmentIds: res.attachments.map((a) => a.id),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
