/** Runtime HTTP / SSE transport abstraction (PRD v1.1 §4.3 / §7). */

export type RuntimeHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RuntimeRequest {
  method?: RuntimeHttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip Authorization (e.g. pairing before token). */
  unauthenticated?: boolean;
  /** Defaults true for mutating methods. */
  idempotent?: boolean;
  /** When false, return raw Response-like body without JSON parse. */
  parseJson?: boolean;
}

export interface RuntimeStreamRequest {
  method?: RuntimeHttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  unauthenticated?: boolean;
  lastEventId?: string;
}

export interface RuntimeSseMessage {
  event?: string | null;
  data: string;
  id?: string | null;
  retry?: number;
}

export interface RuntimeTransport {
  request<T>(request: RuntimeRequest): Promise<T>;
  stream(request: RuntimeStreamRequest): AsyncIterable<RuntimeSseMessage>;
}
