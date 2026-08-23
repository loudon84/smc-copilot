import { describe, expect, it } from "vitest";
import { isExpertTerminalPhase } from "../../../../shared/expert";
import type { ExpertRunProjection } from "../../../../shared/expert";
import { ExpertTimeline } from "./ExpertTimeline";

describe("ExpertTimeline", () => {
  // @lat: [[expert-execution-tests#Minimum stage timeline]]
  it("exports minimum-stage timeline component", () => {
    const projection: ExpertRunProjection = {
      clientRequestId: "req-1",
      taskId: "task-1",
      phase: "running",
      displayStage: "running",
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
      artifactIds: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(isExpertTerminalPhase(projection.phase)).toBe(false);
    expect(ExpertTimeline).toBeTypeOf("function");
  });
});
