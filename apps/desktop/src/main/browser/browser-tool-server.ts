import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { BrowserToolBridge } from "./browser-tool-bridge";

const BASE_PORT = 8765;
const MAX_PORT = 8775;
const REQUEST_TIMEOUT_MS = 30000;

export class BrowserToolServer {
  private toolBridge: BrowserToolBridge;
  private server: Server | null = null;
  private currentPort: number = 0;
  private running: boolean = false;

  constructor(toolBridge: BrowserToolBridge) {
    this.toolBridge = toolBridge;
  }

  async start(): Promise<void> {
    for (let port = BASE_PORT; port <= MAX_PORT; port++) {
      try {
        await this.listenOnPort(port);
        this.currentPort = port;
        this.running = true;
        console.log(`[BROWSER TOOL SERVER] Listening on 127.0.0.1:${port}`);
        return;
      } catch {
        continue;
      }
    }
    console.error("[BROWSER TOOL SERVER] All ports 8765-8775 are in use, tool server not started");
  }

  private listenOnPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => this.handleRequest(req, res));

      server.timeout = REQUEST_TIMEOUT_MS;
      server.on("timeout", (socket) => {
        socket.destroy();
      });

      server.listen(port, "127.0.0.1", () => {
        this.server = server;
        resolve();
      });

      server.on("error", (err) => {
        reject(err);
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const setCorsHeaders = () => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    };

    setCorsHeaders();

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.currentPort}`);

    if (req.method === "GET" && url.pathname === "/tools") {
      const schemas = this.toolBridge.getToolSchemas();
      this.sendJson(res, 200, schemas);
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/tools/")) {
      const toolName = url.pathname.slice(7);
      try {
        const body = await this.readBody(req);
        const params = body ? JSON.parse(body) : {};
        const result = await this.toolBridge.handleToolCall(toolName, params);
        this.sendJson(res, result.ok ? 200 : 400, result);
      } catch (err) {
        this.sendJson(res, 400, { ok: false, message: `Invalid request: ${(err as Error).message}` });
      }
      return;
    }

    this.sendJson(res, 404, { ok: false, message: "Not found" });
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }

  private sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.running = false;
      this.currentPort = 0;
    }
  }

  getPort(): number {
    return this.currentPort;
  }

  isRunning(): boolean {
    return this.running;
  }
}
