import { beforeEach, describe, expect, it, vi } from "vitest";

const { service, listBatch, persist } = vi.hoisted(() => ({
  service: { rehydrate: vi.fn() },
  listBatch: vi.fn(),
  persist: vi.fn(),
}));

vi.mock("../auth/token-store", () => ({
  getCachedAccessToken: () => "token",
  readStoredSessionSync: () => ({ user: { id: "u1" } }),
}));
vi.mock("../session-continuation-store", () => ({
  loadNormalizedContinuationItems: () => [],
  persistSessionContinuation: persist,
}));
vi.mock("./skill-run-ipc", () => ({ getSkillRunService: () => service }));
vi.mock("./skill-run-transcript-store", () => ({
  listSkillRunTranscriptForSession: listBatch,
}));

import { rehydrateSkillRunContinuationsForSession } from "./skill-run-continuation";

describe("skill run terminal result recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBatch.mockReturnValue({
      activities: [],
      runs: [{
        clientRequestId: "req-result-retry",
        providerRunId: "run-result-retry",
        toolName: "writer.article",
        prompt: "draft report",
        sessionId: "session-1",
        profileId: "default",
        phase: "succeeded",
        displayStage: "Skill completed successfully",
        lastEventId: null,
        eventSeq: 2,
        errorCode: "RESULT_RETRIEVAL_FAILED",
        errorMessage: "Result is temporarily unavailable",
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:01.000Z",
        auditComplete: true,
      }],
    });
    service.rehydrate.mockResolvedValue({
      clientRequestId: "req-result-retry",
      phase: "succeeded",
    });
  });

  it("rehydrates only succeeded unavailable result rows without starting a second Provider run", async () => {
    await expect(rehydrateSkillRunContinuationsForSession("session-1")).resolves.toEqual([
      expect.objectContaining({ clientRequestId: "req-result-retry", phase: "succeeded" }),
    ]);
    expect(service.rehydrate).toHaveBeenCalledWith(expect.objectContaining({
      clientRequestId: "req-result-retry",
      providerRunId: "run-result-retry",
      errorCode: "RESULT_RETRIEVAL_FAILED",
    }));
    expect(service).not.toHaveProperty("start");
  });
});
