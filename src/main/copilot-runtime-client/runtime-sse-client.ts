/**
 * SSE client scaffold (PRD §9). Full durable Chat use comes in Phase 3.
 * Supports Last-Event-ID + auto-reconnect hooks without ownership of event DB.
 */
import { buildRuntimeRequestHeaders, CopilotRuntimeHttpError } from "./runtime-http-client";
import { resolveServeBaseUrl } from "./runtime-mode";
import { mapNetworkError } from "./runtime-error-mapper";

export interface RuntimeSseMessage {
  id: string | null;
  event: string | null;
  data: string;
}

export interface RuntimeSseSubscribeOptions {
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  lastEventId?: string | null;
  signal?: AbortSignal;
  onMessage: (message: RuntimeSseMessage) => void;
  onError?: (error: unknown) => void;
  /** Default 1500ms */
  reconnectDelayMs?: number;
  /** Default true */
  autoReconnect?: boolean;
}

function buildUrl(baseUrl: string, path: string, query?: RuntimeSseSubscribeOptions["query"]): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function parseSseChunk(buffer: string): { messages: RuntimeSseMessage[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const messages: RuntimeSseMessage[] = [];
  for (const part of parts) {
    if (!part.trim() || part.startsWith(":")) continue;
    let id: string | null = null;
    let event: string | null = null;
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("id:")) id = line.slice(3).trim();
      else if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    messages.push({ id, event, data: dataLines.join("\n") });
  }
  return { messages, rest };
}

export async function subscribeRuntimeSse(options: RuntimeSseSubscribeOptions): Promise<void> {
  const autoReconnect = options.autoReconnect ?? true;
  const delay = options.reconnectDelayMs ?? 1500;
  let lastEventId = options.lastEventId ?? null;

  while (!options.signal?.aborted) {
    const baseUrl = resolveServeBaseUrl();
    const url = buildUrl(baseUrl, options.path, options.query);
    const { headers } = buildRuntimeRequestHeaders({
      method: "GET",
      extra: {
        Accept: "text/event-stream",
        ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      },
      idempotent: false,
    });

    try {
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: options.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`SSE HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (!options.signal?.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;
        for (const message of parsed.messages) {
          if (message.id) lastEventId = message.id;
          options.onMessage(message);
        }
      }
    } catch (err) {
      if (options.signal?.aborted) return;
      options.onError?.(
        err instanceof CopilotRuntimeHttpError ? err : mapNetworkError(err),
      );
      if (!autoReconnect) return;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    if (!autoReconnect) return;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
