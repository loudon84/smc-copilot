import { WebSocketServer, type WebSocket } from "ws";
import { createServer, type IncomingMessage, type Server } from "http";
import { randomUUID } from "crypto";

export type FakeAcpScenario =
  | "prompt"
  | "slow-prompt"
  | "slow-resume"
  | "hang-session-new"
  | "hang-prompt"
  | "permission"
  | "cancel"
  | "artifact"
  | "replay"
  | "resume-lost"
  | "turn-seq-reset"
  | "prompt-error"
  | "binding-missing"
  | "remote-run-failed";

export interface FakeAcpServer {
  url: string;
  port: number;
  close(): Promise<void>;
  dropClients(): void;
  lastHeaders: Record<string, string>;
  lastProtocol: string;
  mutatingFrames: JsonRpc[];
  sessionId: string;
}

type JsonRpc = Record<string, unknown>;

export async function startFakeRemoteAcpServer(options?: {
  scenario?: FakeAcpScenario;
  acceptSubprotocol?: boolean;
}): Promise<FakeAcpServer> {
  const scenario = options?.scenario ?? "prompt";
  const acceptSubprotocol = options?.acceptSubprotocol ?? true;
  const mutatingFrames: JsonRpc[] = [];
  const sessionId = randomUUID();
  const state = {
    lastProtocol: "",
    lastHeaders: {} as Record<string, string>,
  };
  let seq = 0;
  let promptCount = 0;

  const httpServer: Server = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  const wss = new WebSocketServer({
    server: httpServer,
    handleProtocols: (protocols) => {
      state.lastProtocol = [...protocols][0] ?? "";
      return acceptSubprotocol ? "nodeskclaw.remote-acp.v1" : "";
    },
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    state.lastProtocol =
      String(req.headers["sec-websocket-protocol"] ?? "")
        .split(",")[0]
        ?.trim() || state.lastProtocol;
    state.lastHeaders = {
      authorization: String(req.headers.authorization ?? ""),
      "x-org-id": String(req.headers["x-org-id"] ?? ""),
      "x-trace-id": String(req.headers["x-trace-id"] ?? ""),
    };
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.searchParams.get("token") || url.searchParams.get("access_token")) {
      ws.close();
      return;
    }
    ws.on("message", (data) => {
      const frame = JSON.parse(String(data)) as JsonRpc;
      if (frame.method) mutatingFrames.push(frame);
      handle(ws, frame);
    });
  });

  function send(ws: WebSocket, frame: JsonRpc): void {
    ws.send(JSON.stringify({ jsonrpc: "2.0", ...frame }));
  }

  let lastPromptId: unknown = undefined;

  function handle(ws: WebSocket, frame: JsonRpc): void {
    const method = String(frame.method ?? "");
    const id = frame.id;
    if (method === "initialize") {
      send(ws, {
        id,
        result: {
          protocolVersion: 1,
          agentCapabilities: { loadSession: false },
        },
      });
      return;
    }
    if (method === "session/new") {
      if (scenario === "hang-session-new") {
        // Never respond — control-plane timeout path.
        return;
      }
      send(ws, { id, result: { sessionId } });
      return;
    }
    if (method === "session/resume") {
      const params = (frame.params ?? {}) as Record<string, unknown>;
      if (scenario === "resume-lost") {
        send(ws, {
          id,
          error: {
            code: -32000,
            message: "session not found",
            data: { error_code: "REMOTE_EXPERT_SESSION_LOST" },
          },
        });
        return;
      }
      const replyResume = () => {
        send(ws, {
          id,
          result: { sessionId: params.sessionId ?? sessionId },
        });
      };
      if (scenario === "slow-resume") {
        setTimeout(replyResume, 500);
        return;
      }
      replyResume();
      if (scenario === "replay") {
        seq += 1;
        send(ws, {
          method: "session/update",
          params: {
            sessionId,
            seq: 1,
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "replayed" },
          },
        });
      }
      return;
    }
    if (method === "session/prompt") {
      lastPromptId = id;
      promptCount += 1;
      if (scenario === "prompt-error") {
        send(ws, {
          id,
          error: {
            code: -32000,
            message: "execution context denied",
            data: { error_code: "ACP_CONTEXT_REVALIDATION_DENIED" },
          },
        });
        return;
      }
      if (scenario === "binding-missing") {
        send(ws, {
          id,
          error: {
            code: -32000,
            message: "prior runtime session binding missing",
          },
        });
        return;
      }
      if (scenario === "remote-run-failed") {
        // Stream assistant text then close prompt via JSON-RPC error
        // (Provider mis-channel; Consumer must still complete the turn).
        seq += 1;
        send(ws, {
          method: "session/update",
          params: {
            sessionId,
            seq,
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "answer from agent" },
          },
        });
        send(ws, {
          id,
          error: {
            code: -32000,
            message: "remote run failed",
            data: { error_code: "ACP_REMOTE_RUN_FAILED" },
          },
        });
        return;
      }
      if (scenario === "turn-seq-reset") {
        // Each prompt restarts Provider turn-local seq at 1.
        const count = promptCount === 1 ? 72 : 5;
        for (let i = 1; i <= count; i += 1) {
          send(ws, {
            method: "session/update",
            params: {
              sessionId,
              seq: i,
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: `t${promptCount}-${i}` },
            },
          });
        }
        send(ws, { id, result: { stopReason: "end_turn" } });
        return;
      }
      if (scenario === "hang-prompt") {
        seq += 1;
        send(ws, {
          method: "session/update",
          params: {
            sessionId,
            seq,
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "partial" },
          },
        });
        // Leave prompt Promise hanging until socket close / cancel.
        return;
      }
      if (scenario === "permission") {
        seq += 1;
        send(ws, {
          method: "session/request_permission",
          id: "perm-1",
          params: {
            sessionId,
            toolCall: { toolCallId: "a1", title: "approval requested" },
            options: [
              { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
              { optionId: "reject_once", name: "Reject", kind: "reject_once" },
            ],
            _meta: { nodeskclaw: { approval_id: "a1", run_id: randomUUID() } },
          },
        });
        return;
      }
      const finishPrompt = () => {
        seq += 1;
        send(ws, {
          method: "session/update",
          params: {
            sessionId,
            seq,
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "hello" },
          },
        });
        if (scenario === "artifact") {
          seq += 1;
          send(ws, {
            method: "session/update",
            params: {
              sessionId,
              seq,
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "resource_link",
                uri: `nodeskclaw://artifact/${randomUUID()}/${randomUUID()}`,
                name: "out.txt",
                downloadPath:
                  "/api/v1/remote-experts/sales-expert/acp/runs/r/artifacts/a",
              },
            },
          });
        }
        send(ws, {
          id,
          result: {
            stopReason: scenario === "cancel" ? "cancelled" : "end_turn",
          },
        });
      };
      if (scenario === "slow-prompt") {
        // Longer than the former 10s RPC timer; prompt must still resolve.
        setTimeout(finishPrompt, 11_000);
        return;
      }
      finishPrompt();
      return;
    }
    if (method === "session/cancel") {
      send(ws, { id, result: {} });
      return;
    }
    if (method === "session/close") {
      send(ws, { id, result: {} });
      return;
    }
    if (id && !method) {
      send(ws, {
        method: "session/update",
        params: {
          sessionId,
          seq: ++seq,
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "continued" },
        },
      });
      if (scenario === "permission") {
        send(ws, {
          id: lastPromptId,
          result: { stopReason: "end_turn" },
        });
      }
    }
  }

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    get lastHeaders() {
      return state.lastHeaders;
    },
    get lastProtocol() {
      return state.lastProtocol;
    },
    mutatingFrames,
    sessionId,
    dropClients: () => {
      for (const client of wss.clients) {
        try {
          client.close();
        } catch {
          /* ignore */
        }
      }
    },
    close: () =>
      new Promise((resolve) => {
        for (const client of wss.clients) {
          try {
            client.close();
          } catch {
            /* ignore */
          }
        }
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      }),
  };
}
