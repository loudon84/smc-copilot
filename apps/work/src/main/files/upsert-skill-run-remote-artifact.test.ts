// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ hermesHome: "" }));

vi.mock("../runtime/hermes-runtime-paths", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
  getHermesHome: () => mockState.hermesHome,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => mockState.hermesHome,
    setPath: () => undefined,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock("../skill-run/skill-run-session-materialize", () => ({
  skillRunTranscriptBubbleIds: (clientRequestId: string) => ({
    user: `skill-run:${clientRequestId}:user`,
    assistant: `skill-run:${clientRequestId}:assistant`,
  }),
}));

vi.mock("./file-domain-events", () => ({
  emitFileDomainEvent: () => undefined,
}));

describe("upsertSkillRunRemoteArtifact", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-skill-upsert-"));
    vi.resetModules();
  });

  afterEach(async () => {
    const store = await import("./file-association-store");
    store.closeFileIndexDb();
    try {
      rmSync(mockState.hermesHome, { recursive: true, force: true });
    } catch {
      // Windows may hold the temp directory until GC; force already requested.
    }
  });

  it("associates agent-output on the assistant bubble and persists checksum", async () => {
    const { upsertSkillRunRemoteArtifact } = await import(
      "./upsert-skill-run-remote-artifact"
    );
    const result = upsertSkillRunRemoteArtifact({
      meta: {
        id: "art-1",
        file_name: "out.txt",
        size_bytes: 12,
        sha256:
          "4f85f7e7d5d1b8c7a898d0e51fc5de49536c870353302dacfe7d8e6c03e8ad7a",
      },
      runId: "run-1",
      sessionId: "sess-1",
      profileId: "default",
      clientRequestId: "req-9",
    });
    expect(result).not.toBeNull();
    expect(result?.association.role).toBe("agent-output");
    expect(result?.association.messageId).toBe("skill-run:req-9:assistant");
    expect(result?.file.contentHash).toBe(
      "4f85f7e7d5d1b8c7a898d0e51fc5de49536c870353302dacfe7d8e6c03e8ad7a",
    );
    expect(result?.file.remoteRunId).toBe("run-1");
    const source = readFileSync(
      join(fileURLToPath(new URL(".", import.meta.url)), "upsert-skill-run-remote-artifact.ts"),
      "utf8",
    );
    expect(source).not.toContain("assistant_attachment");
  });

  it("returns null for invalid meta or missing runId", async () => {
    const { upsertSkillRunRemoteArtifact } = await import(
      "./upsert-skill-run-remote-artifact"
    );
    expect(
      upsertSkillRunRemoteArtifact({
        meta: { id: "", file_name: "out.txt" },
        runId: "run-1",
        sessionId: "sess-1",
        clientRequestId: "req-9",
      }),
    ).toBeNull();
    expect(
      upsertSkillRunRemoteArtifact({
        meta: { id: "art-1", file_name: "out.txt" },
        runId: "  ",
        sessionId: "sess-1",
        clientRequestId: "req-9",
      }),
    ).toBeNull();
  });
});

describe("SkillRunService artifact discovery retry", () => {
  const services: Array<{ dispose: () => void }> = [];

  afterEach(() => {
    while (services.length > 0) {
      services.pop()?.dispose();
    }
  });

  it("keeps succeeded, retries listRunArtifacts, and never issues a second tools/call", async () => {
    const { createSkillRunService } = await import(
      "../skill-run/skill-run-service"
    );
    const listRunArtifacts = vi
      .fn()
      .mockRejectedValueOnce(new Error("list down"))
      .mockResolvedValueOnce([
        { id: "art-1", file_name: "output.txt", sha256: "ab".repeat(32) },
      ]);
    const callSkill = vi.fn().mockResolvedValue({
      runId: "run-retry-1",
      status: "starting",
    });
    const gateway = {
      listCatalog: vi.fn().mockResolvedValue({
        status: "ready",
        tools: [
          {
            toolName: "calculator",
            title: "Calculator",
            interactionMode: "chat",
            promptField: "prompt",
            supportsAttachments: false,
            callability: "callable",
            invocationMode: "prompt-first",
            inputSchema: {
              type: "object",
              properties: { prompt: { type: "string" } },
              required: ["prompt"],
            },
          },
        ],
      }),
      callSkill,
      getRunSnapshot: vi.fn().mockResolvedValue({
        runId: "run-retry-1",
        status: "succeeded",
        resultText: "ok",
      }),
      cancelRun: vi.fn().mockResolvedValue(undefined),
      listRunArtifacts,
      openEventStream: vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => {
            let done = false;
            return {
              read: async () => {
                if (done) return { done: true, value: undefined };
                done = true;
                return {
                  done: false,
                  value: new TextEncoder().encode(
                    'event: run.completed\nid: evt-1\ndata: {"event_id":"evt-1","event_type":"run.completed","event_seq":1,"payload":{"text":"ok"}}\n\n',
                  ),
                };
              },
            };
          },
        },
      }),
      hasConsumerLock: () => true,
      hasApprovalDecisionBundle: () => true,
      hasAttachmentBundle: () => true,
      uploadAttachment: vi.fn().mockRejectedValue(new Error("upload not expected")),
      decideApproval: vi.fn().mockRejectedValue(new Error("decide not expected")),
      clearCache: vi.fn(),
      dispose: vi.fn(),
    };
    const service = createSkillRunService({
      gatewayClient: gateway,
      getFeatureMode: () => "skill-first",
      sleep: () => Promise.resolve(),
    });
    services.push(service);

    const start = await service.start({
      toolName: "calculator",
      prompt: "2+2",
      clientRequestId: "req-retry",
      sessionId: "sess-retry",
      profileId: "default",
    });
    expect(start.accepted).toBe(true);

    const started = Date.now();
    let projection = service.getProjection("req-retry");
    while (
      Date.now() - started < 2000 &&
      projection?.artifactDiscoveryError !== true
    ) {
      await new Promise((r) => setTimeout(r, 20));
      projection = service.getProjection("req-retry");
    }
    expect(projection?.phase).toBe("succeeded");
    expect(projection?.artifactDiscoveryError).toBe(true);

    const retried = await service.retryArtifactDiscovery({
      clientRequestId: "req-retry",
      sessionId: "sess-retry",
    });
    expect(retried?.artifactDiscoveryError).toBe(false);
    expect(listRunArtifacts).toHaveBeenCalledTimes(2);
    expect(callSkill).toHaveBeenCalledTimes(1);

    await expect(
      service.retryArtifactDiscovery({
        clientRequestId: "req-retry",
        sessionId: "other-session",
      }),
    ).resolves.toBeNull();
    expect(callSkill).toHaveBeenCalledTimes(1);
  });
});
