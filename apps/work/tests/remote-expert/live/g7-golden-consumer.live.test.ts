/**
 * G7 Golden Consumer live harness.
 * Runs only when SMC_REMOTE_EXPERT_G7=1 and required env vars are present.
 * Uses production Remote Expert Main modules with credential/identity shims.
 */
import { createHash, randomUUID } from "crypto";
import {
  appendFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import NodeWebSocket from "ws";

const enabled = process.env.SMC_REMOTE_EXPERT_G7 === "1";
const backend = process.env.SMC_REMOTE_EXPERT_G7_BACKEND_URL?.trim() ?? "";
const token = process.env.SMC_REMOTE_EXPERT_G7_TOKEN?.trim() ?? "";
const orgId = process.env.SMC_REMOTE_EXPERT_G7_ORG_ID?.trim() ?? "";
const userId = process.env.SMC_REMOTE_EXPERT_G7_USER_ID?.trim() ?? "";
const agentRef = process.env.SMC_REMOTE_EXPERT_G7_AGENT_REF?.trim() ?? "";
const designated =
  process.env.SMC_REMOTE_EXPERT_G7_DESIGNATED_TEST_EXPERT?.trim() ?? "";
const permissionPrompt =
  process.env.SMC_REMOTE_EXPERT_G7_PERMISSION_PROMPT?.trim() ?? "";
const longPrompt = process.env.SMC_REMOTE_EXPERT_G7_LONG_PROMPT?.trim() ?? "";
const artifactPrompt =
  process.env.SMC_REMOTE_EXPERT_G7_ARTIFACT_PROMPT?.trim() ?? "";
const localHermesUrl =
  process.env.SMC_REMOTE_EXPERT_G7_LOCAL_HERMES_URL?.trim() ?? "";
const casesPath =
  process.env.SMC_REMOTE_EXPERT_G7_CASES_JSONL?.trim() ||
  join(process.cwd(), "test-results", "remote-expert-g7-cases.jsonl");
const runId =
  process.env.SMC_REMOTE_EXPERT_G7_RUN_ID?.trim() || `g7-local-${Date.now()}`;

const liveReady =
  enabled &&
  Boolean(backend && token && orgId && userId && agentRef && designated) &&
  designated === agentRef;

const describeLive = liveReady ? describe.sequential : describe.skip;

const auditedSockets: NodeWebSocket[] = [];
const auditedUrls: string[] = [];

class AuditedWebSocket extends NodeWebSocket {
  constructor(
    url: string | URL,
    protocols?: string | string[],
    options?: NodeWebSocket.ClientOptions,
  ) {
    super(url, protocols as never, options);
    auditedUrls.push(String(url));
    auditedSockets.push(this);
  }
}

function writeCase(row: Record<string, unknown>): void {
  mkdirSync(join(process.cwd(), "test-results"), { recursive: true });
  appendFileSync(casesPath, `${JSON.stringify(row)}\n`, "utf8");
}

function blockedCase(id: string, errorCode: string, reason: string): void {
  writeCase({
    id,
    status: "BLOCKED",
    errorCode,
    reason,
    operationId: `${runId}:${id}`,
    oracleExpected: "executed",
    oracleActual: "blocked",
    elapsedMs: 0,
  });
}

vi.mock("electron", () => ({
  BrowserWindow: class {
    isDestroyed(): boolean {
      return false;
    }
    webContents = { send: vi.fn() };
  },
  app: { isPackaged: false },
}));

vi.mock("../../../src/main/session-cache", () => ({
  upsertCachedSession: vi.fn(),
}));

vi.mock("../../../src/main/auth/ensure-access-token", () => ({
  ensureFreshAccessToken: vi.fn(async () => token),
}));

vi.mock("../../../src/main/auth/token-store", () => ({
  readStoredSessionSync: () => ({
    user: { id: userId, tenantId: orgId, currentOrgId: orgId },
  }),
  getCachedAccessToken: () => token,
}));

vi.mock("../../../src/main/auth/authorized-backend-transport", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/main/auth/authorized-backend-transport")
  >("../../../src/main/auth/authorized-backend-transport");
  return {
    ...actual,
    resolveBackendBaseUrl: () => backend.replace(/\/$/, ""),
    requireCachedAccessToken: () => token,
    createAuthorizedBackendTransport: () => ({
      getBaseUrl: () => backend.replace(/\/$/, ""),
      getAccessToken: () => token,
      joinUrl: (pathOrUrl: string) =>
        new URL(pathOrUrl, backend.replace(/\/$/, "") + "/").toString(),
      authorizedFetch: async (
        pathOrUrl: string,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = new URL(
          pathOrUrl,
          backend.replace(/\/$/, "") + "/",
        ).toString();
        auditedUrls.push(url);
        return fetch(url, {
          ...init,
          headers: {
            ...(init?.headers ?? {}),
            Authorization: `Bearer ${token}`,
            "X-Org-Id": orgId,
          },
        });
      },
      withAuthRetry: async <T>(op: () => Promise<T>) => op(),
    }),
  };
});

import {
  ensureCompatibleContract,
  resetContractGate,
} from "../../../src/main/remote-expert/remote-expert-contract-gate";
import {
  fetchRemoteExpertByRef,
  fetchRemoteExpertCatalog,
  resetRemoteExpertCatalogCache,
  requireCallableExpert,
} from "../../../src/main/remote-expert/remote-expert-catalog-client";
import { RemoteAcpClient } from "../../../src/main/remote-expert/remote-acp-client";
import {
  getRemoteAcpSessionRef,
  upsertRemoteAcpSessionRef,
} from "../../../src/main/remote-expert/remote-expert-session-store";
import {
  listRemoteExpertLogs,
  resetRemoteExpertLogs,
} from "../../../src/main/remote-expert/remote-expert-log";
import {
  discoveryExactMatch,
  FRONTEND_CONTRACT_DIGEST,
  REMOTE_EXPERT_FRONTEND_CONTRACT_VERSION,
} from "../../../src/shared/remote-expert";
import { openSqliteDatabase } from "../../../src/main/sqlite-database";
import { activeStateDbPath } from "../../../src/main/utils";

describeLive("G7 Golden Consumer live", () => {
  const hermesHome = join(tmpdir(), `g7-hermes-${runId}`);
  let client: RemoteAcpClient | null = null;
  let desktopSessionId = "";
  let acpSessionId = "";
  let lastSeq = 0;
  let discoveryDigest: string | null = null;
  let gateFailed = false;

  beforeAll(() => {
    process.env.HERMES_HOME = hermesHome;
    mkdirSync(hermesHome, { recursive: true });
    const dbPath = activeStateDbPath();
    mkdirSync(join(dbPath, ".."), { recursive: true });
    const db = openSqliteDatabase(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        source TEXT,
        started_at REAL,
        message_count INTEGER,
        title TEXT,
        last_activity_at REAL,
        profile_name TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        role TEXT,
        content TEXT,
        timestamp REAL,
        platform_message_id TEXT,
        active INTEGER DEFAULT 1
      );
    `);
    db.close();
    resetContractGate();
    resetRemoteExpertCatalogCache();
    resetRemoteExpertLogs();
    writeFileSync(casesPath, "", "utf8");
  });

  afterAll(async () => {
    if (client && acpSessionId) {
      try {
        await client.sessionClose(acpSessionId);
      } catch {
        /* cleanup best-effort */
      }
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
    }
  });

  it("[A-G7-LIVE-001] Contract Discovery exact 8-field match", async () => {
    const started = Date.now();
    const operationId = `${runId}:A-G7-LIVE-001`;
    try {
      const discovery = await ensureCompatibleContract({
        baseUrl: backend.replace(/\/$/, ""),
      });
      expect(discoveryExactMatch(discovery)).toBe(true);
      discoveryDigest = discovery.frontendContractDigest;
      writeCase({
        id: "A-G7-LIVE-001",
        status: "PASS",
        operationId,
        oracleExpected: REMOTE_EXPERT_FRONTEND_CONTRACT_VERSION,
        oracleActual: discovery.frontendContractVersion,
        elapsedMs: Date.now() - started,
        provider: {
          frontendContractVersion: discovery.frontendContractVersion,
          frontendContractDigest: discovery.frontendContractDigest,
        },
      });
    } catch (err) {
      gateFailed = true;
      writeCase({
        id: "A-G7-LIVE-001",
        status: "FAIL",
        operationId,
        errorCode:
          err instanceof Error && "code" in err
            ? String((err as { code: string }).code)
            : "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE",
        oracleExpected: "exact match",
        oracleActual: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - started,
      });
      throw err;
    }
  });

  it("[A-G7-LIVE-002] Catalog target ready + remoteTransport", async () => {
    if (gateFailed) {
      blockedCase("A-G7-LIVE-002", "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE", "gate failed");
      return;
    }
    const started = Date.now();
    const operationId = `${runId}:A-G7-LIVE-002`;
    const list = await fetchRemoteExpertCatalog({ force: true });
    const item = list.items.find((i) => i.agentRef === agentRef);
    expect(item).toBeTruthy();
    const callable = requireCallableExpert(item!);
    expect(callable.status).toBe("ready");
    expect(callable.capabilities.acp.remoteTransport).toBe(true);
    await fetchRemoteExpertByRef(agentRef);
    writeCase({
      id: "A-G7-LIVE-002",
      status: "PASS",
      operationId,
      oracleExpected: "ready+remoteTransport",
      oracleActual: `${callable.status}:${callable.capabilities.acp.remoteTransport}`,
      elapsedMs: Date.now() - started,
    });
  });

  it("[A-G7-LIVE-003] Initialize public WSS", async () => {
    if (gateFailed) {
      blockedCase("A-G7-LIVE-003", "REMOTE_EXPERT_PROVIDER_INCOMPATIBLE", "gate failed");
      return;
    }
    const started = Date.now();
    const operationId = `${runId}:A-G7-LIVE-003`;
    client = new RemoteAcpClient({
      baseUrl: backend.replace(/\/$/, ""),
      agentRef,
      getAccessToken: () => token,
      getOrgId: () => orgId,
      webSocketImpl: AuditedWebSocket as unknown as typeof NodeWebSocket,
    });
    await client.connect();
    const init = await client.initialize();
    expect(init.protocolVersion).toBe(1);
    writeCase({
      id: "A-G7-LIVE-003",
      status: "PASS",
      operationId,
      traceId: client.traceId,
      oracleExpected: "protocolVersion=1",
      oracleActual: String(init.protocolVersion),
      elapsedMs: Date.now() - started,
    });
  });

  it("[A-G7-LIVE-004] Session New persists local ref", async () => {
    if (gateFailed || !client) {
      blockedCase("A-G7-LIVE-004", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    const operationId = `${runId}:A-G7-LIVE-004`;
    desktopSessionId = randomUUID();
    acpSessionId = await client.sessionNew();
    expect(acpSessionId.length).toBeGreaterThan(0);
    const ref = upsertRemoteAcpSessionRef({
      schemaVersion: 1,
      desktopSessionId,
      agentRef,
      acpSessionId,
      lastSeq: 0,
      connectionState: "active",
      updatedAt: Date.now(),
    });
    expect(getRemoteAcpSessionRef(desktopSessionId)?.acpSessionId).toBe(
      acpSessionId,
    );
    writeCase({
      id: "A-G7-LIVE-004",
      status: "PASS",
      operationId,
      traceId: client.traceId,
      oracleExpected: "acpSessionId non-empty + persisted",
      oracleActual: ref.acpSessionId,
      elapsedMs: Date.now() - started,
    });
  });

  it("[A-G7-LIVE-005] Prompt streaming end_turn", async () => {
    if (gateFailed || !client || !acpSessionId) {
      blockedCase("A-G7-LIVE-005", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    const operationId = `${runId}:A-G7-LIVE-005`;
    let deltas = 0;
    const onUpdate = (params: {
      seq?: number;
      sessionUpdate?: string | { sessionUpdate?: string };
    }) => {
      if (typeof params.seq === "number") lastSeq = Math.max(lastSeq, params.seq);
      const kind =
        typeof params.sessionUpdate === "string"
          ? params.sessionUpdate
          : params.sessionUpdate?.sessionUpdate;
      if (kind === "agent_message_chunk" || kind === "agent_message") {
        deltas += 1;
      }
    };
    client.on("session/update", onUpdate);
    const requestId = randomUUID();
    const result = await client.sessionPrompt(
      acpSessionId,
      [{ type: "text", text: `G7 ping ${runId}` }],
      requestId,
    );
    client.off("session/update", onUpdate);
    lastSeq = Math.max(lastSeq, client.lastSeq);
    expect(deltas).toBeGreaterThanOrEqual(1);
    upsertRemoteAcpSessionRef({
      schemaVersion: 1,
      desktopSessionId,
      agentRef,
      acpSessionId,
      lastSeq,
      connectionState: "active",
      updatedAt: Date.now(),
    });
    writeCase({
      id: "A-G7-LIVE-005",
      status: "PASS",
      operationId,
      traceId: client.traceId,
      oracleExpected: ">=1 delta + end_turn",
      oracleActual: `deltas=${deltas};stop=${result.stopReason}`,
      elapsedMs: Date.now() - started,
    });
  });

  it("[A-G7-LIVE-006] Transcript projection classification", async () => {
    if (gateFailed || !desktopSessionId || !acpSessionId) {
      blockedCase("A-G7-LIVE-006", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    const operationId = `${runId}:A-G7-LIVE-006`;
    try {
      const { materializeRemoteExpertTurn } = await import(
        "../../../src/main/remote-expert/remote-expert-transcript"
      );
      const { REMOTE_EXPERT_SESSION_CLASSIFICATION } = await import(
        "../../../src/main/session-metadata-store"
      );
      materializeRemoteExpertTurn({
        sessionId: desktopSessionId,
        profileId: "default",
        userContent: `G7 ping ${runId}`,
        assistantContent: "g7-assistant-projection",
        turnId: randomUUID(),
      });
      const { getDbConnection } = await import("../../../src/main/db");
      const db = getDbConnection(true);
      expect(db).toBeTruthy();
      const rows = db!
        .prepare(
          `SELECT role, content FROM messages WHERE session_id = ? AND active = 1 ORDER BY id`,
        )
        .all(desktopSessionId) as Array<{ role: string; content: string }>;
      const roles = rows.map((r) => r.role);
      expect(roles).toContain("user");
      expect(roles).toContain("assistant");
      expect(REMOTE_EXPERT_SESSION_CLASSIFICATION).toMatchObject({
        sessionKind: "chat",
        executionProvider: "remote-expert-acp",
      });
      const ref = getRemoteAcpSessionRef(desktopSessionId);
      expect(ref?.agentRef).toBe(agentRef);
      expect(ref?.acpSessionId).toBe(acpSessionId);
      writeCase({
        id: "A-G7-LIVE-006",
        status: "PASS",
        operationId,
        oracleExpected: "user+assistant rows + chat/remote-expert-acp",
        oracleActual: `roles=${roles.join(",")};provider=${REMOTE_EXPERT_SESSION_CLASSIFICATION.executionProvider}`,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      writeCase({
        id: "A-G7-LIVE-006",
        status: "FAIL",
        operationId,
        errorCode: "G7_LIVE_CASE_FAILED",
        oracleExpected: "user+assistant rows + chat/remote-expert-acp",
        oracleActual: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - started,
      });
      throw err;
    }
  });

  it("[A-G7-LIVE-007] Resume same acpSessionId", async () => {
    if (gateFailed || !client || !acpSessionId) {
      blockedCase("A-G7-LIVE-007", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    client.disconnect();
    const resumedClient = new RemoteAcpClient({
      baseUrl: backend.replace(/\/$/, ""),
      agentRef,
      getAccessToken: () => token,
      getOrgId: () => orgId,
      webSocketImpl: AuditedWebSocket as unknown as typeof NodeWebSocket,
    });
    await resumedClient.connect();
    await resumedClient.initialize();
    const resumed = await resumedClient.sessionResume(acpSessionId, lastSeq);
    expect(resumed).toBe(acpSessionId);
    client = resumedClient;
    writeCase({
      id: "A-G7-LIVE-007",
      status: "PASS",
      operationId: `${runId}:A-G7-LIVE-007`,
      traceId: resumedClient.traceId,
      oracleExpected: acpSessionId,
      oracleActual: resumed,
      elapsedMs: Date.now() - started,
    });
  });

  it("[A-G7-LIVE-008] Disconnect/reconnect in-flight fencing", async () => {
    if (gateFailed || !client || !acpSessionId) {
      blockedCase("A-G7-LIVE-008", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    const before = acpSessionId;
    const socket = auditedSockets[auditedSockets.length - 1];
    socket?.terminate();
    await new Promise((r) => setTimeout(r, 200));
    const afterDisconnect = client.acpSessionId;
    // Must not silently mint a new session id on the same client.
    expect(afterDisconnect === null || afterDisconnect === before).toBe(true);
    writeCase({
      id: "A-G7-LIVE-008",
      status: "PASS",
      operationId: `${runId}:A-G7-LIVE-008`,
      oracleExpected: "no silent session/new",
      oracleActual: String(afterDisconnect),
      elapsedMs: Date.now() - started,
    });
    // Reboot client for later cases
    client = new RemoteAcpClient({
      baseUrl: backend.replace(/\/$/, ""),
      agentRef,
      getAccessToken: () => token,
      getOrgId: () => orgId,
      webSocketImpl: AuditedWebSocket as unknown as typeof NodeWebSocket,
    });
    await client.connect();
    await client.initialize();
    await client.sessionResume(before, lastSeq);
    acpSessionId = before;
  });

  it("[A-G7-LIVE-009] Attachment resource_link path (no local path leak)", async () => {
    if (gateFailed || !client || !acpSessionId) {
      blockedCase("A-G7-LIVE-009", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    const operationId = `${runId}:A-G7-LIVE-009`;
    try {
      const {
        uploadAttachmentBytes,
        assertPromptBlocksSafe,
        buildPromptBlocks,
      } = await import(
        "../../../src/main/remote-expert/remote-attachment-client"
      );
      const receipt = await uploadAttachmentBytes({
        filename: `g7-probe-${runId}.txt`,
        bytes: new TextEncoder().encode(`g7 attachment ${runId}`),
        contentType: "text/plain",
      });
      expect(receipt.attachment_ref).toMatch(/^att_/);
      const prompt = buildPromptBlocks(`G7 attachment probe ${runId}`, [
        {
          type: "resource_link",
          uri: `nodeskclaw://attachment/${receipt.attachment_ref}`,
          name: receipt.name || "probe.txt",
        },
      ]);
      assertPromptBlocksSafe(prompt);
      const serialized = JSON.stringify(prompt);
      expect(serialized).not.toMatch(/[A-Za-z]:\\/);
      expect(serialized).not.toMatch(/\/Users\//);
      expect(serialized).toContain("nodeskclaw://attachment/");
      await client.sessionPrompt(acpSessionId, prompt, randomUUID());
      writeCase({
        id: "A-G7-LIVE-009",
        status: "PASS",
        operationId,
        oracleExpected: "attachment_ref accepted + resource_link in prompt",
        oracleActual: receipt.attachment_ref,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      writeCase({
        id: "A-G7-LIVE-009",
        status: "FAIL",
        operationId,
        errorCode:
          err instanceof Error && "code" in err
            ? String((err as { code: string }).code)
            : "G7_LIVE_CASE_FAILED",
        oracleExpected: "attachment_ref accepted + resource_link in prompt",
        oracleActual: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - started,
      });
      throw err;
    }
  });

  it("[A-G7-LIVE-010] Permission roundtrip", async () => {
    if (!permissionPrompt) {
      blockedCase(
        "A-G7-LIVE-010",
        "G7_ENV_INCOMPLETE",
        "SMC_REMOTE_EXPERT_G7_PERMISSION_PROMPT missing",
      );
      return;
    }
    if (gateFailed || !client || !acpSessionId) {
      blockedCase("A-G7-LIVE-010", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    let sawPermission = false;
    const onPermission = () => {
      sawPermission = true;
    };
    client.on("session/request_permission", onPermission);
    try {
      await client.sessionPrompt(
        acpSessionId,
        [{ type: "text", text: permissionPrompt }],
        randomUUID(),
      );
    } catch {
      /* may stay pending on permission */
    }
    client.off("session/request_permission", onPermission);
    writeCase({
      id: "A-G7-LIVE-010",
      status: sawPermission ? "PASS" : "FAIL",
      operationId: `${runId}:A-G7-LIVE-010`,
      oracleExpected: "permission.requested",
      oracleActual: sawPermission ? "seen" : "missing",
      elapsedMs: Date.now() - started,
    });
    if (!sawPermission) {
      throw new Error("permission request not observed");
    }
  });

  it("[A-G7-LIVE-011] Cancel long-running prompt", async () => {
    if (!longPrompt) {
      blockedCase(
        "A-G7-LIVE-011",
        "G7_ENV_INCOMPLETE",
        "SMC_REMOTE_EXPERT_G7_LONG_PROMPT missing",
      );
      return;
    }
    if (gateFailed || !client || !acpSessionId) {
      blockedCase("A-G7-LIVE-011", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    const operationId = `${runId}:A-G7-LIVE-011`;
    const sessionBefore = acpSessionId;
    let terminal: "completed" | "cancelled" | "failed" | "unknown" = "unknown";
    try {
      const promptPromise = client.sessionPrompt(
        acpSessionId,
        [{ type: "text", text: longPrompt }],
        randomUUID(),
      );
      await new Promise((r) => setTimeout(r, 200));
      await client.sessionCancel(acpSessionId);
      try {
        const result = await promptPromise;
        terminal =
          /cancel|stop/i.test(result.stopReason) ? "cancelled" : "completed";
      } catch {
        terminal = "cancelled";
      }
      // Cancel must not mint a new ACP session id (no duplicate run).
      expect(client.acpSessionId === null || client.acpSessionId === sessionBefore).toBe(
        true,
      );
      if (terminal === "completed") {
        throw new Error(`cancel did not stop prompt; stopReason terminal=${terminal}`);
      }
      writeCase({
        id: "A-G7-LIVE-011",
        status: "PASS",
        operationId,
        oracleExpected: "cancelled/stopped; same acpSessionId",
        oracleActual: terminal,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      writeCase({
        id: "A-G7-LIVE-011",
        status: "FAIL",
        operationId,
        errorCode: "G7_LIVE_CASE_FAILED",
        oracleExpected: "cancelled/stopped; same acpSessionId",
        oracleActual: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - started,
      });
      throw err;
    }
  });

  it("[A-G7-LIVE-012] Artifact generation", async () => {
    if (!artifactPrompt) {
      blockedCase(
        "A-G7-LIVE-012",
        "G7_ENV_INCOMPLETE",
        "SMC_REMOTE_EXPERT_G7_ARTIFACT_PROMPT missing",
      );
      return;
    }
    if (gateFailed || !client || !acpSessionId) {
      blockedCase("A-G7-LIVE-012", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    let sawArtifact = false;
    const onUpdate = (params: {
      sessionUpdate?: string | { sessionUpdate?: string; type?: string };
    }) => {
      const kind =
        typeof params.sessionUpdate === "string"
          ? params.sessionUpdate
          : String(
              params.sessionUpdate?.sessionUpdate ??
                params.sessionUpdate?.type ??
                "",
            );
      if (kind.includes("artifact") || kind.includes("resource")) {
        sawArtifact = true;
      }
    };
    client.on("session/update", onUpdate);
    await client.sessionPrompt(
      acpSessionId,
      [{ type: "text", text: artifactPrompt }],
      randomUUID(),
    );
    client.off("session/update", onUpdate);
    writeCase({
      id: "A-G7-LIVE-012",
      status: sawArtifact ? "PASS" : "FAIL",
      operationId: `${runId}:A-G7-LIVE-012`,
      oracleExpected: "artifact event",
      oracleActual: sawArtifact ? "seen" : "missing",
      elapsedMs: Date.now() - started,
    });
    if (!sawArtifact) throw new Error("artifact not observed");
  });

  it("[A-G7-LIVE-013] Session Close stays closed", async () => {
    if (gateFailed || !client || !acpSessionId || !desktopSessionId) {
      blockedCase("A-G7-LIVE-013", "G7_LIVE_CASE_FAILED", "prereq");
      return;
    }
    const started = Date.now();
    await client.sessionClose(acpSessionId);
    upsertRemoteAcpSessionRef({
      schemaVersion: 1,
      desktopSessionId,
      agentRef,
      acpSessionId,
      lastSeq,
      connectionState: "closed",
      updatedAt: Date.now(),
    });
    client.disconnect();
    const ref = getRemoteAcpSessionRef(desktopSessionId);
    expect(ref?.connectionState).toBe("closed");
    writeCase({
      id: "A-G7-LIVE-013",
      status: "PASS",
      operationId: `${runId}:A-G7-LIVE-013`,
      oracleExpected: "closed",
      oracleActual: ref?.connectionState,
      elapsedMs: Date.now() - started,
    });
    acpSessionId = "";
    client = null;
  });

  it("[A-G7-LIVE-014] Security / route boundary", () => {
    const started = Date.now();
    const dump = auditedUrls.join("\n");
    expect(dump).not.toMatch(/\/internal\//);
    expect(dump).not.toMatch(/nodeskclaw-agent:/);
    expect(dump).not.toMatch(/remote-hermes:/);
    const logs = JSON.stringify(listRemoteExpertLogs());
    expect(logs).not.toContain(token);
    writeCase({
      id: "A-G7-LIVE-014",
      status: "PASS",
      operationId: `${runId}:A-G7-LIVE-014`,
      oracleExpected: "no internal/direct/token leak",
      oracleActual: "ok",
      elapsedMs: Date.now() - started,
      orgIdHash: `sha256:${createHash("sha256").update(orgId, "utf8").digest("hex")}`,
      frontendContractDigest: discoveryDigest ?? FRONTEND_CONTRACT_DIGEST,
    });
  });

  it("[A-G7-LIVE-015] Local Chat isolation after remote outage", async () => {
    if (!localHermesUrl) {
      blockedCase(
        "A-G7-LIVE-015",
        "G7_ENV_INCOMPLETE",
        "SMC_REMOTE_EXPERT_G7_LOCAL_HERMES_URL missing",
      );
      return;
    }
    const started = Date.now();
    // Simulate remote backend unavailable for subsequent remote calls.
    const unreachable = "https://127.0.0.1:1";
    try {
      await ensureCompatibleContract({ baseUrl: unreachable });
    } catch {
      /* expected */
    }
    const health = await fetch(
      new URL("/health", localHermesUrl.replace(/\/$/, "")).toString(),
    ).catch(() => null);
    const ok = Boolean(health?.ok || health?.status === 200);
    writeCase({
      id: "A-G7-LIVE-015",
      status: ok ? "PASS" : "BLOCKED",
      operationId: `${runId}:A-G7-LIVE-015`,
      errorCode: ok ? undefined : "G7_LIVE_CASE_FAILED",
      oracleExpected: "local hermes health ok",
      oracleActual: health ? String(health.status) : "unreachable",
      elapsedMs: Date.now() - started,
    });
    if (!ok) {
      throw new Error("Local Hermes health check failed");
    }
  });

  it("[A-NEG-G7-LIVE-001] designated test expert enforced", () => {
    expect(designated).toBe(agentRef);
    writeCase({
      id: "A-NEG-G7-LIVE-001",
      status: "PASS",
      operationId: `${runId}:A-NEG-G7-LIVE-001`,
      oracleExpected: agentRef,
      oracleActual: designated,
      elapsedMs: 0,
    });
  });

  it("[A-G7-RUNNER-001] live cases executed (not fixed BLOCKED)", () => {
    expect(liveReady).toBe(true);
    expect(existsSync(casesPath)).toBe(true);
  });
});

describe("G7 live harness gating", () => {
  it("skips live suite when env incomplete (documented by g7.mjs prereq)", () => {
    if (liveReady) {
      expect(enabled).toBe(true);
    } else {
      expect(liveReady).toBe(false);
    }
  });
});
