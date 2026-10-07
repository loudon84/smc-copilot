import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import NodeWebSocket from "ws";
import {
  ACP_PROTOCOL_VERSION,
  RemoteExpertError,
  TRANSPORT_PROFILE,
  UUID_RE,
} from "../../shared/remote-expert";

type WsClient = {
  protocol: string;
  readyState: number;
  once(event: string, listener: (...args: any[]) => void): void;
  on(event: string, listener: (...args: any[]) => void): void;
  send(data: string): void;
  close(): void;
};

type WsCtor = {
  new (
    url: string,
    protocols?: string[],
    options?: { headers?: Record<string, string> },
  ): WsClient;
  OPEN: number;
};

const WsImpl = NodeWebSocket as unknown as WsCtor;

export type JsonRpcFrame = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: {
      error_code?: string;
      symbol?: string;
      remote_error_code?: string;
      message?: string;
    };
  };
  _meta?: { nodeskclaw?: { after_seq?: number } };
};

/** Provider capability / run-context denial (TTL ~90s on open WS). */
export function isExecutionContextDenied(err: unknown): boolean {
  if (!(err instanceof RemoteExpertError)) return false;
  if (err.code === "REMOTE_EXPERT_FORBIDDEN") {
    return /execution context denied/i.test(err.message);
  }
  return /execution context denied/i.test(err.message);
}

export function mapAcpRpcError(error: {
  message?: string;
  data?: {
    error_code?: string;
    symbol?: string;
    remote_error_code?: string;
  };
}): RemoteExpertError {
  const message = String(error.message ?? "ACP protocol error").trim() ||
    "ACP protocol error";
  const raw = String(
    error.data?.error_code ||
      error.data?.symbol ||
      error.data?.remote_error_code ||
      "",
  ).trim();
  if (raw === "ACP_SESSION_BUSY") {
    return new RemoteExpertError("REMOTE_EXPERT_PROMPT_REJECTED", message);
  }
  if (
    raw === "ACP_CONTEXT_REVALIDATION_DENIED" ||
    /execution context denied/i.test(message)
  ) {
    return new RemoteExpertError("REMOTE_EXPERT_FORBIDDEN", message);
  }
  if (
    raw === "ACP_SESSION_NOT_FOUND" ||
    raw === "REMOTE_EXPERT_SESSION_LOST" ||
    raw === "ACP_SESSION_RESUME_FORBIDDEN" ||
    /prior runtime session binding missing/i.test(message)
  ) {
    // Provider lost the runtime↔session binding (e.g. after restart/resume).
    // Treat as session lost so the turn service marks expired instead of
    // surfacing a raw ACP_PROTOCOL_ERROR.
    return new RemoteExpertError("REMOTE_EXPERT_SESSION_LOST", message);
  }
  return new RemoteExpertError(raw || "ACP_PROTOCOL_ERROR", message);
}

export interface RemoteAcpClientOptions {
  baseUrl: string;
  agentRef: string;
  getAccessToken: () => string;
  getOrgId: () => string;
  webSocketImpl?: WsCtor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function buildAcpWebSocketUrl(baseUrl: string, agentRef: string): string {
  const http = new URL(baseUrl);
  const url = new URL(
    `/api/v1/remote-experts/${encodeURIComponent(agentRef)}/acp`,
    http,
  );
  url.protocol = http.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";
  if (url.search || url.href.includes("?")) {
    throw new RemoteExpertError(
      "REMOTE_EXPERT_CREDENTIAL_LEAK_GUARD",
      "ACP URL must not contain query credentials",
    );
  }
  return url.toString();
}

function mapUpgradeStatus(status: number, errorCode?: string): never {
  const code =
    errorCode ||
    (status === 401
      ? "REMOTE_ACP_AUTH_REQUIRED"
      : status === 403
        ? "REMOTE_ACP_ORG_FORBIDDEN"
        : status === 404
          ? "REMOTE_ACP_EXPERT_NOT_FOUND"
          : status === 503
            ? "REMOTE_ACP_RUNTIME_UNAVAILABLE"
            : "REMOTE_ACP_ROUTE_FAILED");
  throw new RemoteExpertError(code, `WSS upgrade ${status}`);
}

export class RemoteAcpClient extends EventEmitter {
  readonly options: RemoteAcpClientOptions;
  phase:
    | "IDLE"
    | "CONNECTING"
    | "CONNECTED"
    | "INITIALIZED"
    | "SESSION_ACTIVE"
    | "PROMPT_ACTIVE"
    | "WAITING_PERMISSION"
    | "CANCELLING"
    | "DISCONNECTED"
    | "CLOSED" = "IDLE";
  /** Turn-scoped cursor: max accepted Provider seq for currentPromptRequestId. */
  lastSeq = 0;
  /** Active prompt request id that owns lastSeq dedupe scope. */
  currentPromptRequestId = "";
  acpSessionId: string | null = null;
  traceId = "";
  /** Wall clock when the current WSS became CONNECTED (capability mint time). */
  connectedAt = 0;
  private socket: WsClient | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
    }
  >();
  private reconnecting = false;

  constructor(options: RemoteAcpClientOptions) {
    super();
    this.options = options;
  }

  get isReconnecting(): boolean {
    return this.reconnecting;
  }

  /**
   * Reset Turn-scoped seq cursor before a new session/prompt.
   * Dedup identity is (currentPromptRequestId, seq), not session-global seq.
   */
  resetTurnCursor(requestId: string): void {
    this.currentPromptRequestId = requestId.trim();
    this.lastSeq = 0;
  }

  async connect(): Promise<void> {
    if (this.phase !== "IDLE" && this.phase !== "DISCONNECTED") {
      return;
    }
    this.phase = "CONNECTING";
    this.traceId = randomUUID();
    const url = buildAcpWebSocketUrl(this.options.baseUrl, this.options.agentRef);
    const Impl = this.options.webSocketImpl ?? WsImpl;
    const orgId = this.options.getOrgId();
    if (!orgId) {
      this.phase = "IDLE";
      throw new RemoteExpertError(
        "REMOTE_EXPERT_ORG_REQUIRED",
        "currentOrgId required",
      );
    }
    const token = this.options.getAccessToken();
    await new Promise<void>((resolve, reject) => {
      const ws = new Impl(url, [TRANSPORT_PROFILE], {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Org-Id": orgId,
          "X-Trace-Id": this.traceId,
        },
      });
      this.socket = ws;
      ws.once("unexpected-response", (_req, res) => {
        try {
          mapUpgradeStatus(res.statusCode ?? 500);
        } catch (err) {
          reject(err as Error);
        }
      });
      ws.once("error", (err) => {
        this.phase = "DISCONNECTED";
        reject(
          new RemoteExpertError(
            "REMOTE_ACP_ROUTE_FAILED",
            err.message,
            { retryable: true },
          ),
        );
      });
      ws.once("open", () => {
        const protocol = ws.protocol;
        if (protocol !== TRANSPORT_PROFILE) {
          ws.close();
          reject(
            new RemoteExpertError(
              "REMOTE_ACP_TRANSPORT_UNSUPPORTED",
              "subprotocol mismatch",
            ),
          );
          return;
        }
        this.phase = "CONNECTED";
        this.connectedAt = Date.now();
        resolve();
      });
      setTimeout(() => {
        if (this.phase === "CONNECTING") {
          reject(
            new RemoteExpertError(
              "REMOTE_ACP_ROUTE_FAILED",
              "WSS connect timeout",
              { retryable: true },
            ),
          );
        }
      }, 8000);
      ws.on("message", (data) => this.onMessage(String(data)));
      ws.on("close", () => {
        const wasClosed = this.phase === "CLOSED";
        this.phase = wasClosed ? "CLOSED" : "DISCONNECTED";
        this.connectedAt = 0;
        this.acpSessionId = null;
        this.rejectAll(
          new RemoteExpertError(
            "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
            "socket closed",
            { retryable: true },
          ),
        );
        if (!wasClosed) {
          this.emit("disconnected");
        }
      });
    });
  }

  async initialize(): Promise<{ protocolVersion: number }> {
    if (this.phase !== "CONNECTED" && this.phase !== "INITIALIZED") {
      throw new RemoteExpertError(
        "ACP_INITIALIZE_FAILED",
        "not connected",
      );
    }
    const result = (await this.request("initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
    })) as { protocolVersion?: number };
    if (result?.protocolVersion !== 1) {
      throw new RemoteExpertError(
        "ACP_INITIALIZE_FAILED",
        "protocolVersion mismatch",
      );
    }
    this.phase = "INITIALIZED";
    return { protocolVersion: 1 };
  }

  async sessionNew(cwd?: string): Promise<string> {
    this.assertInitializedForMutation("session/new");
    // Keep pending after control-plane timeout so a late result can still bind
    // acpSessionId (unknown-commit recovery). Do not blind-retry session/new.
    const result = (await this.request(
      "session/new",
      {
        cwd: cwd ?? "",
        mcpServers: [],
      },
      undefined,
      { keepPendingOnTimeout: true },
    )) as { sessionId?: string };
    const sessionId = String(result?.sessionId ?? "").trim();
    if (!sessionId) {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_SESSION_CREATE_FAILED",
        "empty sessionId",
      );
    }
    this.acpSessionId = sessionId;
    this.phase = "SESSION_ACTIVE";
    return sessionId;
  }

  async sessionResume(
    sessionId: string,
    afterSeq: number,
    cwd?: string,
  ): Promise<string> {
    this.assertInitializedForMutation("session/resume");
    const params: Record<string, unknown> = { sessionId };
    const absoluteCwd = String(cwd ?? "").trim();
    if (absoluteCwd) {
      params.cwd = absoluteCwd;
      params.mcpServers = [];
    }
    if (afterSeq > 0) {
      params._meta = { nodeskclaw: { after_seq: afterSeq } };
    }
    const result = (await this.request("session/resume", params)) as {
      sessionId?: string;
    };
    const resumed = String(result?.sessionId ?? "").trim();
    if (!resumed || resumed !== sessionId) {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_SESSION_LOST",
        "resume sessionId mismatch",
      );
    }
    this.acpSessionId = resumed;
    this.phase = "SESSION_ACTIVE";
    return resumed;
  }

  async sessionPrompt(
    sessionId: string,
    prompt: unknown[],
    requestId: string,
  ): Promise<{ stopReason: string }> {
    if (this.reconnecting) {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
        "reconnect in progress",
        { retryable: true },
      );
    }
    if (this.phase !== "SESSION_ACTIVE" && this.phase !== "PROMPT_ACTIVE") {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
        "no active session",
      );
    }
    if (!UUID_RE.test(requestId)) {
      throw new RemoteExpertError(
        "ACP_PROTOCOL_ERROR",
        "requestId must be a UUID string",
      );
    }
    this.resetTurnCursor(requestId);
    this.phase = "PROMPT_ACTIVE";
    try {
      const result = (await this.request(
        "session/prompt",
        { sessionId, prompt },
        requestId,
      )) as { stopReason?: string };
      this.phase = "SESSION_ACTIVE";
      return { stopReason: String(result?.stopReason ?? "end_turn") };
    } catch (err) {
      if (this.phase === "PROMPT_ACTIVE") {
        this.phase = "SESSION_ACTIVE";
      }
      throw err;
    }
  }

  async sessionCancel(sessionId: string): Promise<void> {
    this.phase = "CANCELLING";
    await this.request("session/cancel", { sessionId });
  }

  async sessionClose(sessionId: string): Promise<void> {
    try {
      await this.request("session/close", { sessionId });
    } catch (err) {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_SESSION_CLOSE_FAILED",
        (err as Error).message,
      );
    } finally {
      this.phase = "CLOSED";
      this.acpSessionId = null;
      this.socket?.close();
    }
  }

  respondPermission(
    requestId: string,
    optionId: "allow_once" | "reject_once",
    meta?: unknown,
  ): void {
    this.send({
      jsonrpc: "2.0",
      id: requestId,
      result: {
        outcome: { outcome: "selected", optionId },
        ...(meta ? { _meta: meta } : {}),
      },
    });
    this.phase = "PROMPT_ACTIVE";
  }

  markReconnecting(value: boolean): void {
    this.reconnecting = value;
  }

  disconnect(): void {
    this.socket?.close();
  }

  private assertInitializedForMutation(method: string): void {
    if (this.phase !== "INITIALIZED" && this.phase !== "SESSION_ACTIVE") {
      throw new RemoteExpertError(
        "ACP_PROTOCOL_ERROR",
        `${method} requires initialize`,
      );
    }
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    id?: string,
    options?: { keepPendingOnTimeout?: boolean },
  ): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WsImpl.OPEN) {
      throw new RemoteExpertError(
        "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
        "socket not open",
        { retryable: true },
      );
    }
    const requestId = id && id.trim() ? id : randomUUID();
    // Long turns / tool chains are bounded by socket lifecycle, not an RPC timer.
    const isPrompt = method === "session/prompt";
    const keepPendingOnTimeout = options?.keepPendingOnTimeout === true;
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (!isPrompt) {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          if (!keepPendingOnTimeout) {
            this.pending.delete(requestId);
          }
          reject(
            new RemoteExpertError("ACP_PROTOCOL_ERROR", `${method} timeout`),
          );
        }, 10_000);
      }
      this.pending.set(requestId, {
        resolve: (value) => {
          if (settled && !keepPendingOnTimeout) return;
          const wasSettled = settled;
          settled = true;
          if (timer) clearTimeout(timer);
          this.pending.delete(requestId);
          if (wasSettled && keepPendingOnTimeout) {
            // Late session/new result after control-plane timeout: bind only.
            if (
              method === "session/new" &&
              !this.acpSessionId &&
              isRecord(value) &&
              typeof value.sessionId === "string" &&
              value.sessionId.trim()
            ) {
              this.acpSessionId = value.sessionId.trim();
              if (this.phase === "INITIALIZED") {
                this.phase = "SESSION_ACTIVE";
              }
              this.emit("session/new-late", this.acpSessionId);
            }
            return;
          }
          resolve(value);
        },
        reject: (err) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          this.pending.delete(requestId);
          reject(err);
        },
      });
      this.send({ jsonrpc: "2.0", id: requestId, method, params });
    });
  }

  private send(frame: JsonRpcFrame): void {
    this.socket?.send(JSON.stringify(frame));
  }

  private rejectAll(err: Error): void {
    for (const [, pending] of this.pending) pending.reject(err);
    this.pending.clear();
  }

  private onMessage(raw: string): void {
    let frame: JsonRpcFrame;
    try {
      frame = JSON.parse(raw) as JsonRpcFrame;
    } catch {
      return;
    }
    if (frame.jsonrpc !== "2.0") return;
    if (frame.method === "session/update") {
      const params = isRecord(frame.params) ? frame.params : {};
      const seq = Number(params.seq ?? 0);
      if (Number.isFinite(seq) && seq > 0) {
        if (seq <= this.lastSeq) {
          this.emit("duplicate-seq", seq);
          return;
        }
        this.lastSeq = seq;
      }
      this.emit("session/update", params);
      return;
    }
    if (frame.method === "session/request_permission") {
      this.phase = "WAITING_PERMISSION";
      this.emit("session/request_permission", {
        id: frame.id,
        params: frame.params,
      });
      return;
    }
    if (frame.id === undefined || frame.id === null) return;
    const pending = this.pending.get(String(frame.id));
    if (!pending) return;
    this.pending.delete(String(frame.id));
    if (frame.error) {
      pending.reject(mapAcpRpcError(frame.error));
      return;
    }
    pending.resolve(frame.result);
  }
}
