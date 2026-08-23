import { describe, expect, it } from "vitest";
import { normalizeContinuationItems } from "../src/main/session-continuation-store";

describe("session continuation expert-run", () => {
  // @lat: [[expert-execution-tests#Continuation normalize whitelist]]
  it("preserves versioned expert-run items and drops invalid ones", () => {
    const items = normalizeContinuationItems([
      {
        kind: "expert-run",
        schemaVersion: 1,
        taskId: "task-1",
        clientRequestId: "req-1",
        expertSlug: "call-prep",
        skillName: "customer-profiling",
        promptSummary: "hello",
        sessionId: "session-1",
        profileId: "default",
        authGeneration: "user:u1",
        lastEventId: "evt-1",
        phase: "running",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        kind: "expert-run",
        schemaVersion: 2,
        taskId: "bad",
      },
      { kind: "user", content: "hi" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.kind).toBe("expert-run");
    if (items[0]?.kind === "expert-run") {
      expect(items[0].schemaVersion).toBe(1);
      expect(items[0].taskId).toBe("task-1");
    }
  });
});
