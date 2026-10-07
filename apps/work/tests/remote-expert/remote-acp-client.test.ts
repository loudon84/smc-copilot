import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import {
  buildAcpWebSocketUrl,
  isExecutionContextDenied,
  mapAcpRpcError,
  RemoteAcpClient,
} from "../../src/main/remote-expert/remote-acp-client";
import { startFakeRemoteAcpServer } from "./fake-remote-acp-server";

describe("mapAcpRpcError", () => {
  it("maps ACP_CONTEXT_REVALIDATION_DENIED and symbol forms to FORBIDDEN", () => {
    const byCode = mapAcpRpcError({
      message: "execution context denied",
      data: { error_code: "ACP_CONTEXT_REVALIDATION_DENIED" },
    });
    expect(byCode.code).toBe("REMOTE_EXPERT_FORBIDDEN");
    expect(isExecutionContextDenied(byCode)).toBe(true);

    const bySymbol = mapAcpRpcError({
      message: "execution context denied",
      data: { symbol: "ACP_CONTEXT_REVALIDATION_DENIED" },
    });
    expect(bySymbol.code).toBe("REMOTE_EXPERT_FORBIDDEN");
  });
});

describe("RemoteAcpClient transport", () => {
  it("[A-TRANSPORT-001] rejects leftover query in constructed ACP URL", () => {
    const url = buildAcpWebSocketUrl("http://127.0.0.1:9", "sales-expert");
    expect(url).toBe(
      "ws://127.0.0.1:9/api/v1/remote-experts/sales-expert/acp",
    );
    expect(url).not.toContain("?");
  });

  it("[A-NEG-SESSION-001] blocks session/new before initialize", async () => {
    const server = await startFakeRemoteAcpServer();
    try {
      const client = new RemoteAcpClient({
        baseUrl: server.url,
        agentRef: "sales-expert",
        getAccessToken: () => "tok",
        getOrgId: () => "org-1",
      });
      await client.connect();
      await expect(client.sessionNew()).rejects.toMatchObject({
        code: "ACP_PROTOCOL_ERROR",
      });
      expect(
        server.mutatingFrames.filter((f) => f.method === "session/new"),
      ).toHaveLength(0);
      client.disconnect();
    } finally {
      await server.close();
    }
  });

  it("[A-TRANSPORT-001] [A-SESSION-001] [A-PROMPT-001] handshakes, streams prompt updates, then terminals", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "prompt" });
    try {
      const client = new RemoteAcpClient({
        baseUrl: server.url,
        agentRef: "sales-expert",
        getAccessToken: () => "tok",
        getOrgId: () => "org-1",
      });
      const updates: unknown[] = [];
      client.on("session/update", (p) => updates.push(p));
      await client.connect();
      expect(server.lastProtocol).toBe("nodeskclaw.remote-acp.v1");
      expect(server.lastHeaders.authorization).toBe("Bearer tok");
      expect(server.lastHeaders["x-org-id"]).toBe("org-1");
      expect(server.lastHeaders["x-trace-id"]).toMatch(/^[0-9a-f-]{36}$/i);
      await client.initialize();
      const sid = await client.sessionNew();
      const requestId = randomUUID();
      const result = await client.sessionPrompt(
        sid,
        [{ type: "text", text: "hi" }],
        requestId,
      );
      expect(result.stopReason).toBe("end_turn");
      expect(updates.length).toBeGreaterThan(0);
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      client.disconnect();
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-NEG-TRANSPORT-001] rejects empty negotiated subprotocol", async () => {
    const OPEN = 1;
    class EmptyProtocolSocket {
      protocol = "";
      readyState = OPEN;
      once(event: string, listener: (...args: unknown[]) => void) {
        if (event === "open") queueMicrotask(() => listener());
      }
      on() {}
      send() {}
      close() {}
    }
    const client = new RemoteAcpClient({
      baseUrl: "http://127.0.0.1:9",
      agentRef: "sales-expert",
      getAccessToken: () => "tok",
      getOrgId: () => "org-1",
      webSocketImpl: Object.assign(EmptyProtocolSocket, { OPEN }) as never,
    });
    await expect(client.connect()).rejects.toMatchObject({
      code: "REMOTE_ACP_TRANSPORT_UNSUPPORTED",
    });
  });

  it("[A-SESSION-001] drops duplicate seq updates", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "replay" });
    try {
      const client = new RemoteAcpClient({
        baseUrl: server.url,
        agentRef: "sales-expert",
        getAccessToken: () => "tok",
        getOrgId: () => "org-1",
      });
      const updates: unknown[] = [];
      const dupes: number[] = [];
      client.on("session/update", (p) => updates.push(p));
      client.on("duplicate-seq", (seq) => dupes.push(seq as number));
      await client.connect();
      await client.initialize();
      await client.sessionResume(server.sessionId, 0);
      expect(updates.length).toBe(1);
      expect(dupes).toEqual([]);
      client.disconnect();
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-TL-PROMPT-001] [A-SMC-005] session/prompt survives beyond the 10s control-plane timer", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "slow-prompt" });
    try {
      const client = new RemoteAcpClient({
        baseUrl: server.url,
        agentRef: "sales-expert",
        getAccessToken: () => "tok",
        getOrgId: () => "org-1",
      });
      await client.connect();
      await client.initialize();
      const sid = await client.sessionNew();
      const started = Date.now();
      const result = await client.sessionPrompt(
        sid,
        [{ type: "text", text: "long" }],
        randomUUID(),
      );
      expect(Date.now() - started).toBeGreaterThan(10_000);
      expect(result.stopReason).toBe("end_turn");
      client.disconnect();
    } finally {
      await server.close();
    }
  }, 30_000);

  it("[A-NEG-TL-PROMPT-001] prompt-period socket close rejects retryable without hanging", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "hang-prompt" });
    try {
      const client = new RemoteAcpClient({
        baseUrl: server.url,
        agentRef: "sales-expert",
        getAccessToken: () => "tok",
        getOrgId: () => "org-1",
      });
      await client.connect();
      await client.initialize();
      const sid = await client.sessionNew();
      const pending = client.sessionPrompt(
        sid,
        [{ type: "text", text: "hang" }],
        randomUUID(),
      );
      await new Promise((r) => setTimeout(r, 50));
      server.dropClients();
      await expect(pending).rejects.toMatchObject({
        code: "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
        retryable: true,
      });
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-SMC-004] three prompts keep the same ACP sessionId", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "prompt" });
    try {
      const client = new RemoteAcpClient({
        baseUrl: server.url,
        agentRef: "sales-expert",
        getAccessToken: () => "tok",
        getOrgId: () => "org-1",
      });
      await client.connect();
      await client.initialize();
      const sid = await client.sessionNew();
      for (let i = 0; i < 3; i += 1) {
        await client.sessionPrompt(
          sid,
          [{ type: "text", text: `m${i}` }],
          randomUUID(),
        );
        expect(client.acpSessionId).toBe(sid);
      }
      client.disconnect();
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-SMC-003] [N-SMC-002] turn cursor reset accepts Turn2 seq=1 after Turn1 seq=72", async () => {
    const server = await startFakeRemoteAcpServer({
      scenario: "turn-seq-reset",
    });
    try {
      const client = new RemoteAcpClient({
        baseUrl: server.url,
        agentRef: "sales-expert",
        getAccessToken: () => "tok",
        getOrgId: () => "org-1",
      });
      const turn2Seq: number[] = [];
      let turn = 0;
      client.on("session/update", (params: { seq?: number }) => {
        if (turn === 2 && typeof params.seq === "number") {
          turn2Seq.push(params.seq);
        }
      });
      await client.connect();
      await client.initialize();
      const sid = await client.sessionNew();
      turn = 1;
      await client.sessionPrompt(sid, [{ type: "text", text: "t1" }], randomUUID());
      expect(client.lastSeq).toBe(72);
      turn = 2;
      await client.sessionPrompt(sid, [{ type: "text", text: "t2" }], randomUUID());
      expect(turn2Seq).toEqual([1, 2, 3, 4, 5]);
      expect(client.lastSeq).toBe(5);
      client.disconnect();
    } finally {
      await server.close();
    }
  }, 20_000);
});
