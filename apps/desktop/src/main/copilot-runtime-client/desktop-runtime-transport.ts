/**
 * Desktop RuntimeTransport wrapping runtimeFetch / runtimeFetchRaw (PRD v1.1 §4.3).
 * Preserves Bearer auth, Idempotency-Key, X-Request-ID, and DesktopRuntimeError mapping.
 */
import type {
  RuntimeRequest,
  RuntimeSseMessage,
  RuntimeStreamRequest,
  RuntimeTransport,
} from "@smc/runtime-client";
import { readSseStream } from "@smc/runtime-client";
import { CopilotRuntimeHttpError, runtimeFetch, runtimeFetchRaw } from "./runtime-http-client";

export function createDesktopRuntimeTransport(): RuntimeTransport {
  return {
    async request<T>(request: RuntimeRequest): Promise<T> {
      return runtimeFetch<T>({
        method: request.method,
        path: request.path,
        query: request.query,
        body: request.body,
        headers: request.headers,
        signal: request.signal,
        unauthenticated: request.unauthenticated,
        idempotent: request.idempotent,
        parseJson: request.parseJson,
      });
    },

    async *stream(request: RuntimeStreamRequest): AsyncIterable<RuntimeSseMessage> {
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        ...(request.headers ?? {}),
      };
      if (request.lastEventId) {
        headers["Last-Event-ID"] = request.lastEventId;
      }
      try {
        const res = await runtimeFetchRaw({
          method: request.method ?? "GET",
          path: request.path,
          query: request.query,
          body: request.body,
          headers,
          signal: request.signal,
          unauthenticated: request.unauthenticated,
          idempotent: false,
        });
        yield* readSseStream(res, request.signal);
      } catch (err) {
        if (err instanceof CopilotRuntimeHttpError) throw err;
        throw err;
      }
    },
  };
}
