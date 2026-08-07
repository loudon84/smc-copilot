import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer } from "http";
import { existsSync, mkdirSync, rmSync } from "fs";

const { TEST_USER_DATA } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_USER_DATA: path.join(os.tmpdir(), `mcp-skill-gateway-proxy-${Date.now()}`),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "userData") return TEST_USER_DATA;
      return "/tmp";
    },
  },
}));

vi.mock("../src/main/auth/auth-endpoint-config-store", () => ({
  readAuthEndpointConfig: () => ({
    backendUrl: "http://192.168.0.118:4510",
    authPrefix: "/api/v1/auth",
    aiosHomeUrl: "http://192.168.0.118:4517",
  }),
}));

vi.mock("../src/main/auth/token-store", () => ({
  getCachedAccessToken: vi.fn(() => null as string | null),
  readStoredSessionSync: vi.fn(() => null),
}));

import { getCachedAccessToken } from "../src/main/auth/token-store";
import {
  MCP_SKILL_GATEWAY_JSONRPC_ERRORS,
} from "../src/shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import {
  startMcpSkillGatewayProxy,
  stopMcpSkillGatewayProxy,
} from "../src/main/mcp-skill-gateway-runtime/mcp-skill-gateway-proxy";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  mkdirSync(TEST_USER_DATA, { recursive: true });
  stopMcpSkillGatewayProxy();
  vi.mocked(getCachedAccessToken).mockReturnValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      if (url.includes("/api/v1/system/info")) {
        return {
          ok: true,
          json: async () => ({
            mcp: {
              endpoint: "/api/v1/mcp",
              healthEndpoint: "/api/v1/mcp/health",
              name: "Coding MCP Gateway",
            },
          }),
        } as Response;
      }
      if (url.includes("/api/v1/mcp/health")) {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof fetch,
  );
});

afterEach(() => {
  stopMcpSkillGatewayProxy();
  if (existsSync(TEST_USER_DATA)) {
    rmSync(TEST_USER_DATA, { recursive: true, force: true });
  }
});

describe("mcp-skill-gateway proxy", () => {
  it("returns enhanced health with self/backend/mcp sections", async () => {
    await startMcpSkillGatewayProxy(48799);

    const res = await fetch("http://127.0.0.1:48799/health");
    const body = (await res.json()) as {
      self?: { ok?: boolean; port?: number };
      backend?: { ok?: boolean; baseUrl?: string };
      mcp?: { status?: string };
      loggedIn?: boolean;
      localMcpUrl?: string;
    };

    expect(body.self?.ok).toBe(true);
    expect(body.self?.port).toBe(48799);
    expect(body.backend?.baseUrl).toBe("http://192.168.0.118:4510");
    expect(body.mcp?.status).toBe("unauthorized");
    expect(body.localMcpUrl).toBe("http://127.0.0.1:48799/mcp?profile=default");
    expect(body.loggedIn).toBe(false);
  });

  it("accepts POST /admin/config on localhost", async () => {
    await startMcpSkillGatewayProxy(48799);

    const res = await fetch("http://127.0.0.1:48799/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upstreamUrl: "http://192.168.0.118:4510/api/v1/mcp",
        transport: "streamable_http",
        protocolVersion: "2025-06-18",
      }),
    });

    const body = (await res.json()) as { ok?: boolean; config?: { upstreamUrl?: string } };
    expect(body.ok).toBe(true);
    expect(body.config?.upstreamUrl).toBe("http://192.168.0.118:4510/api/v1/mcp");
  });

  it("returns -32010 when desktop is not logged in", async () => {
    await startMcpSkillGatewayProxy(48799);

    const res = await fetch("http://127.0.0.1:48799/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    const body = (await res.json()) as {
      error?: { code?: number; message?: string; data?: { errorCode?: string } };
    };
    expect(body.error?.code).toBe(MCP_SKILL_GATEWAY_JSONRPC_ERRORS.NOT_LOGGED_IN);
    expect(body.error?.message).toBe("Desktop login required");
    expect(body.error?.data?.errorCode).toBe("MCP_UNAUTHORIZED");
  });

  it("reports MCP_GATEWAY_PROXY_PORT_IN_USE when port is occupied", async () => {
    const blocker = await new Promise<ReturnType<typeof createServer>>((resolve) => {
      const s = createServer();
      s.listen(48800, "127.0.0.1", () => resolve(s));
    });

    try {
      await expect(startMcpSkillGatewayProxy(48800)).rejects.toMatchObject({
        code: "MCP_GATEWAY_PROXY_PORT_IN_USE",
      });
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
