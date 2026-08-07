import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { getServer, listServers } from "./mcp-server-registry";
import { getEnabledBinding } from "./mcp-skill-binding-service";
import { invokeFromProxy } from "./mcp-invocation-service";
import { MCP_ERROR_CODES, McpServiceError } from "../../shared/mcp/mcp-errors";
import { listTools } from "./mcp-skill-binding-service";

const DEFAULT_PORT = 18781;

let server: Server | null = null;
let currentPort = DEFAULT_PORT;

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function getMcpProxyUrl(): string {
  return `http://127.0.0.1:${currentPort}`;
}

export function isMcpProxyRunning(): boolean {
  return server != null;
}

export async function startMcpRuntimeProxy(): Promise<void> {
  if (server) return;

  await new Promise<void>((resolve, reject) => {
    const s = createServer((req, res) => {
      void handleRequest(req, res);
    });
    s.listen(DEFAULT_PORT, "127.0.0.1", () => {
      server = s;
      currentPort = DEFAULT_PORT;
      console.log(`[MCP PROXY] Listening on ${getMcpProxyUrl()}`);
      resolve();
    });
    s.on("error", reject);
  });
}

export function stopMcpRuntimeProxy(): void {
  if (server) {
    server.close();
    server = null;
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", getMcpProxyUrl());

  if (req.method === "GET" && url.pathname === "/health") {
    const servers = listServers();
    const enabledTools = listTools().filter((t) => t.enabled).length;
    sendJson(res, 200, {
      status: "ok",
      version: "v6.1",
      servers: servers.length,
      enabled_tools: enabledTools,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/mcp/skills/call") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as {
        profile?: string;
        skill_id?: string;
        server_id?: string;
        tool_name?: string;
        arguments?: Record<string, unknown>;
      };

      const profile = body.profile ?? "default";
      const serverId = body.server_id;
      const toolName = body.tool_name;
      if (!serverId || !toolName) {
        sendJson(res, 400, { error: MCP_ERROR_CODES.ARGUMENT_INVALID });
        return;
      }

      const srv = getServer(serverId);
      if (!srv?.enabled) {
        sendJson(res, 403, { error: MCP_ERROR_CODES.SERVER_DISABLED });
        return;
      }

      const binding = getEnabledBinding(profile, serverId, toolName);
      if (!binding) {
        sendJson(res, 403, { error: MCP_ERROR_CODES.TOOL_DISABLED });
        return;
      }

      const result = await invokeFromProxy(profile, serverId, toolName, body.arguments ?? {});
      sendJson(res, 200, {
        invocation_id: result.invocationId,
        task_id: result.taskId,
        status: result.status,
        event_url: result.eventUrl,
        artifact_url: result.artifactUrl,
      });
    } catch (err) {
      const code = err instanceof McpServiceError ? err.code : MCP_ERROR_CODES.TASK_FAILED;
      sendJson(res, 500, {
        error: code,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}
