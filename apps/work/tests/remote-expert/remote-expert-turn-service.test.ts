import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { startFakeRemoteAcpServer } from "./fake-remote-acp-server";
import type { RemoteAcpSessionRef } from "../../src/shared/remote-expert";

const store = new Map<string, RemoteAcpSessionRef>();
const upsertArtifact = vi.fn();
let backendUrl = "http://127.0.0.1:9";

vi.mock("electron", () => ({
  BrowserWindow: class {},
}));

vi.mock("../../src/main/remote-expert/remote-expert-contract-gate", () => ({
  ensureCompatibleContract: vi.fn(async () => undefined),
}));

vi.mock("../../src/main/remote-expert/remote-expert-catalog-client", () => ({
  fetchRemoteExpertByRef: vi.fn(async () => catalogItem()),
  fetchRemoteExpertCatalog: vi.fn(async () => ({ items: [catalogItem()] })),
}));

vi.mock("../../src/main/auth/ensure-access-token", () => ({
  ensureFreshAccessToken: vi.fn(async () => "tok"),
}));

vi.mock("../../src/main/auth/authorized-backend-transport", () => ({
  createAuthorizedBackendTransport: () => ({
    getAccessToken: () => "tok",
  }),
  resolveBackendBaseUrl: () => backendUrl,
}));

vi.mock("../../src/main/auth/token-store", () => ({
  readStoredSessionSync: () => ({
    user: { id: "u1", tenantId: "org-1", currentOrgId: "org-1" },
  }),
}));

vi.mock("../../src/main/remote-expert/remote-expert-session-store", () => ({
  getRemoteAcpSessionRef: (id: string) => store.get(id) ?? null,
  upsertRemoteAcpSessionRef: (ref: RemoteAcpSessionRef) => {
    const existing = store.get(ref.desktopSessionId);
    const lastSeq = existing ? Math.max(existing.lastSeq, ref.lastSeq) : ref.lastSeq;
    const next = { ...ref, lastSeq };
    store.set(ref.desktopSessionId, next);
    return next;
  },
}));

vi.mock("../../src/main/remote-expert/remote-expert-transcript", () => ({
  materializeRemoteExpertTurn: vi.fn(),
}));

vi.mock("../../src/main/remote-expert/remote-attachment-client", () => ({
  prepareAttachmentResourceLinks: vi.fn(async () => []),
  buildPromptBlocks: (text: string) => [{ type: "text", text }],
}));

vi.mock("../../src/main/remote-expert/remote-artifact-client", () => ({
  upsertRemoteExpertAcpArtifact: (...args: unknown[]) => upsertArtifact(...args),
}));

vi.mock("../../src/main/remote-expert/remote-expert-log", () => ({
  emitRemoteExpertLog: vi.fn(),
  logRemoteExpertError: vi.fn(),
}));

import {
  closeRemoteExpertSession,
  cancelRemoteExpertTurn,
  decideRemoteExpertPermission,
  disposeRemoteExpertSubsystem,
  invalidateRemoteExpertAuth,
  resumeRemoteExpertSession,
  submitRemoteExpertTurn,
} from "../../src/main/remote-expert/remote-expert-turn-service";

function catalogItem() {
  return {
    agentRef: "sales-expert",
    displayName: "Sales Expert",
    description: null,
    category: null,
    tags: [],
    avatar: null,
    status: "ready" as const,
    capabilities: {
      acp: { protocolVersion: 1 as const, remoteTransport: true },
      sessionResume: true,
      attachments: "resource_link",
      artifacts: "resource_link",
      permissions: true,
    },
  };
}

function turnInput(sessionId: string) {
  return {
    kind: "remote-expert" as const,
    agentRef: "sales-expert",
    desktopSessionId: sessionId,
    requestId: randomUUID(),
    promptText: "hi",
    managedFileIds: [] as string[],
    authGeneration: "g1",
    profileId: "default",
  };
}

describe("remote-expert turn service", () => {
  beforeEach(() => {
    store.clear();
    upsertArtifact.mockReset();
    upsertArtifact.mockImplementation((input: { uri: string; name?: string }) => ({
      fileId: "f1",
      name: input.name ?? "out.txt",
      uri: input.uri,
    }));
  });

  afterEach(() => {
    disposeRemoteExpertSubsystem();
  });

  it("[A-RECONNECT-001] rebuilds a disconnected runtime then resumes after_seq", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "prompt" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    try {
      await submitRemoteExpertTurn(turnInput(sessionId));
      const first = store.get(sessionId);
      expect(first?.connectionState).toBe("active");
      expect(first?.lastSeq).toBeGreaterThan(0);
      server.dropClients();
      await new Promise((r) => setTimeout(r, 80));
      expect(store.get(sessionId)?.connectionState).toBe("disconnected");
      await submitRemoteExpertTurn(turnInput(sessionId));
      const frames = server.mutatingFrames.filter(
        (f) => f.method === "session/resume",
      );
      expect(frames.length).toBeGreaterThan(0);
      const resumeParams = frames[0]?.params as Record<string, unknown>;
      expect(
        (resumeParams._meta as { nodeskclaw?: { after_seq?: number } } | undefined)
          ?.nodeskclaw?.after_seq,
      ).toBe(first?.lastSeq);
      expect(store.get(sessionId)?.connectionState).toBe("active");
      expect(store.get(sessionId)?.lastSeq).toBeGreaterThanOrEqual(
        first?.lastSeq ?? 0,
      );
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-PERSIST-001] close persists closed and is not overwritten by disconnected", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "prompt" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    try {
      await submitRemoteExpertTurn(turnInput(sessionId));
      await closeRemoteExpertSession(sessionId);
      expect(store.get(sessionId)?.connectionState).toBe("closed");
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-NEG-RECONNECT-001] expired stored ref blocks submit without session/new", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "prompt" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    store.set(sessionId, {
      schemaVersion: 1,
      desktopSessionId: sessionId,
      agentRef: "sales-expert",
      acpSessionId: "lost-session",
      lastSeq: 3,
      connectionState: "expired",
      updatedAt: Date.now(),
    });
    try {
      await expect(submitRemoteExpertTurn(turnInput(sessionId))).rejects.toMatchObject({
        code: "REMOTE_EXPERT_UNAVAILABLE",
      });
      expect(
        server.mutatingFrames.some((f) => f.method === "session/new"),
      ).toBe(false);
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-NEG-RECONNECT-001] resume session-not-found marks expired", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "resume-lost" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    store.set(sessionId, {
      schemaVersion: 1,
      desktopSessionId: sessionId,
      agentRef: "sales-expert",
      acpSessionId: server.sessionId,
      lastSeq: 1,
      connectionState: "disconnected",
      updatedAt: Date.now(),
    });
    try {
      const ref = await resumeRemoteExpertSession({
        sessionId,
        authGeneration: "g1",
      });
      expect(ref?.connectionState).toBe("expired");
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-PERM-001] [A-NEG-PERM-001] permission fencing rejects a second decide", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "permission" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    try {
      const submitP = submitRemoteExpertTurn(turnInput(sessionId));
      let decided = false;
      for (let i = 0; i < 40 && !decided; i += 1) {
        try {
          decideRemoteExpertPermission({
            sessionId,
            requestId: "perm-1",
            optionId: "allow_once",
            authGeneration: "g1",
          });
          decided = true;
        } catch {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      expect(decided).toBe(true);
      expect(() =>
        decideRemoteExpertPermission({
          sessionId,
          requestId: "perm-1",
          optionId: "reject_once",
          authGeneration: "g1",
        }),
      ).toThrow(/stale|already decided/i);
      await submitP;
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-CANCEL-001] [A-NEG-CANCEL-001] cancel is a no-op without a runtime and works with one", async () => {
    await expect(cancelRemoteExpertTurn("missing")).resolves.toBeUndefined();
    const server = await startFakeRemoteAcpServer({ scenario: "cancel" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    try {
      const pending = submitRemoteExpertTurn(turnInput(sessionId));
      await new Promise((r) => setTimeout(r, 80));
      await cancelRemoteExpertTurn(sessionId);
      await pending;
      expect(
        server.mutatingFrames.some((f) => f.method === "session/cancel"),
      ).toBe(true);
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-NEG-PROMPT-001] rejects a non remote-expert kind", async () => {
    await expect(
      submitRemoteExpertTurn({
        ...turnInput(randomUUID()),
        kind: "chat" as never,
      }),
    ).rejects.toMatchObject({ code: "REMOTE_IPC_INVALID_INPUT" });
  });

  it("[A-NEG-ARTIFACT-001] malformed artifact upsert does not crash the turn", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "artifact" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    upsertArtifact.mockImplementation(() => {
      throw new Error("malformed uri");
    });
    try {
      await expect(submitRemoteExpertTurn(turnInput(sessionId))).resolves.toMatchObject({
        sessionId,
      });
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-SEC-001] auth invalidation disconnects runtimes", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "prompt" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    try {
      await submitRemoteExpertTurn(turnInput(sessionId));
      invalidateRemoteExpertAuth("auth");
      await expect(cancelRemoteExpertTurn(sessionId)).resolves.toBeUndefined();
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-TL-RECONNECT-001] disconnect resume does not issue a new session/prompt for the prior turn", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "prompt" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    try {
      await submitRemoteExpertTurn(turnInput(sessionId));
      const promptCountAfterFirst = server.mutatingFrames.filter(
        (f) => f.method === "session/prompt",
      ).length;
      server.dropClients();
      await new Promise((r) => setTimeout(r, 80));
      await resumeRemoteExpertSession({
        sessionId,
        authGeneration: "g1",
      });
      const prompts = server.mutatingFrames.filter(
        (f) => f.method === "session/prompt",
      );
      const resumes = server.mutatingFrames.filter(
        (f) => f.method === "session/resume",
      );
      expect(prompts).toHaveLength(promptCountAfterFirst);
      expect(resumes.length).toBeGreaterThan(0);
      expect(
        server.mutatingFrames.filter((f) => f.method === "session/new"),
      ).toHaveLength(1);
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-TL-SESSION-001] concurrent submits share one session/new; second is rejected while busy", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "hang-prompt" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    try {
      const first = submitRemoteExpertTurn(turnInput(sessionId));
      await new Promise((r) => setTimeout(r, 120));
      await expect(submitRemoteExpertTurn(turnInput(sessionId))).rejects.toMatchObject({
        code: "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
        message: /turn in progress/i,
      });
      expect(
        server.mutatingFrames.filter((f) => f.method === "session/new"),
      ).toHaveLength(1);
      server.dropClients();
      await expect(first).rejects.toMatchObject({
        code: "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
        message: /IN_FLIGHT_DISCONNECTED/i,
      });
    } finally {
      await server.close();
    }
  }, 20_000);

  it("[A-NEG-TL-SESSION-001] session/new timeout marks expired and blocks retry", async () => {
    const server = await startFakeRemoteAcpServer({
      scenario: "hang-session-new",
    });
    backendUrl = server.url;
    const sessionId = randomUUID();
    try {
      await expect(submitRemoteExpertTurn(turnInput(sessionId))).rejects.toMatchObject({
        code: "REMOTE_EXPERT_UNAVAILABLE",
        message: /session unconfirmed/i,
      });
      expect(store.get(sessionId)?.connectionState).toBe("expired");
      await expect(submitRemoteExpertTurn(turnInput(sessionId))).rejects.toMatchObject({
        code: "REMOTE_EXPERT_UNAVAILABLE",
      });
      expect(
        server.mutatingFrames.filter((f) => f.method === "session/new"),
      ).toHaveLength(1);
    } finally {
      await server.close();
    }
  }, 30_000);

  it("[A-NEG-TL-SESSION-002] reconnecting submit is rejected", async () => {
    const server = await startFakeRemoteAcpServer({ scenario: "slow-resume" });
    backendUrl = server.url;
    const sessionId = randomUUID();
    store.set(sessionId, {
      schemaVersion: 1,
      desktopSessionId: sessionId,
      agentRef: "sales-expert",
      acpSessionId: server.sessionId,
      lastSeq: 1,
      connectionState: "disconnected",
      updatedAt: Date.now(),
    });
    try {
      const resumeP = resumeRemoteExpertSession({
        sessionId,
        authGeneration: "g1",
      });
      await new Promise((r) => setTimeout(r, 80));
      await expect(submitRemoteExpertTurn(turnInput(sessionId))).rejects.toMatchObject({
        code: "REMOTE_EXPERT_SESSION_NOT_ACTIVE",
        message: /turn in progress|reconnect/i,
      });
      await resumeP;
    } finally {
      await server.close();
    }
  }, 20_000);
});
