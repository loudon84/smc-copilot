import { describe, expect, it } from "vitest";

function validateExpertDownloadInput(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid download input");
  }
  const record = value as Record<string, unknown>;
  if ("downloadUrl" in record || "url" in record) {
    throw new Error("Client-supplied artifact URLs are not allowed");
  }
  if (typeof record.taskId !== "string" || typeof record.artifactId !== "string") {
    throw new Error("taskId and artifactId are required");
  }
}

describe("expert ipc validation", () => {
  // @lat: [[expert-execution-tests#Rejects client artifact URLs]]
  it("rejects client-supplied download URLs in artifact payloads", () => {
    expect(() =>
      validateExpertDownloadInput({
        taskId: "task-1",
        artifactId: "a1",
        sessionId: "s1",
        downloadUrl: "http://evil.test/x",
      }),
    ).toThrow(/not allowed/);
  });

  // @lat: [[expert-execution-tests#Requires artifact identifiers]]
  it("requires artifact_id fields without URLs", () => {
    expect(() =>
      validateExpertDownloadInput({
        sessionId: "s1",
      }),
    ).toThrow(/taskId and artifactId/);
  });
});
