import { EventEmitter } from "events";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

export type JsonRpcMessage = Record<string, unknown>;

export class AcpJsonRpcTransport extends EventEmitter {
  private readonly pending = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();
  private buffer = "";
  private nextId = 1;

  constructor(
    private readonly writeLine: (line: string) => void,
    private readonly onNotification?: (method: string, params: Record<string, unknown>) => void,
    private readonly onServerRequest?: (
      id: string | number,
      method: string,
      params: Record<string, unknown>,
    ) => void,
  ) {
    super();
  }

  pushStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcMessage;
        this.dispatch(msg);
      } catch {
        this.emit("malformed", line);
      }
    }
  }

  private dispatch(msg: JsonRpcMessage): void {
    const id = msg.id as string | number | undefined;
    if (typeof msg.method === "string" && id !== undefined) {
      this.onServerRequest?.(id, String(msg.method), (msg.params as Record<string, unknown>) ?? {});
      return;
    }
    if (typeof msg.method === "string") {
      this.onNotification?.(String(msg.method), (msg.params as Record<string, unknown>) ?? {});
      return;
    }
    if (id === undefined) return;
    const waiter = this.pending.get(id);
    if (!waiter) return;
    this.pending.delete(id);
    if (msg.error) {
      const errObj = msg.error as Record<string, unknown>;
      const data = (errObj.data as Record<string, unknown> | undefined) ?? {};
      const symbol = typeof data.symbol === "string" ? data.symbol : "ACP_PROTOCOL_ERROR";
          waiter.reject(
            new RemoteExpertError(
              symbol,
              String(errObj.message ?? "ACP error"),
              data,
            ),
          );
      return;
    }
    waiter.resolve(msg.result);
  }

  request(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const code =
          method === "initialize" ? "ACP_INITIALIZE_TIMEOUT" : "ACP_PROTOCOL_ERROR";
        reject(new RemoteExpertError(code, `${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.writeLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.writeLine(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  respond(id: string | number, result: unknown): void {
    this.writeLine(JSON.stringify({ jsonrpc: "2.0", id, result }));
  }

  rejectAll(err: Error): void {
    for (const waiter of this.pending.values()) {
      waiter.reject(err);
    }
    this.pending.clear();
  }
}
