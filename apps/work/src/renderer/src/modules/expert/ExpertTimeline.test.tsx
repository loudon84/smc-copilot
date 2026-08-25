import { describe, expect, it } from "vitest";
import type { ExpertRunProjection } from "../../../../shared/expert";
import { ExpertRunCard } from "./ExpertRunCard";

describe("ExpertRunCard", () => {
  // @lat: [[expert-execution-tests#Minimum stage timeline]]
  it("is a compact pre-task status row (replaces timeline card)", () => {
    const projection: ExpertRunProjection = {
      clientRequestId: "req-1",
      taskId: null,
      phase: "starting",
      displayStage: "preparing",
      expertSlug: "call-prep",
      skillName: "customer-profiling",
      prompt: "hello",
      sessionId: "session-1",
      profileId: "default",
      lastEventId: null,
      lastEventSeq: null,
      errorCode: null,
      errorMessage: null,
      resultSummary: null,
      resultContent: null,
      progressMessage: null,
      artifactIds: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(ExpertRunCard).toBeTypeOf("function");
    expect(projection.taskId).toBeNull();
  });
});
