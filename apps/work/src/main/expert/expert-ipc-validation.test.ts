import { describe, expect, it } from "vitest";

/**
 * Policy guard: File Platform / Gateway must never accept Renderer-supplied
 * download/preview URLs. Paths are built same-origin from artifact id only.
 */
function rejectClientArtifactUrls(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid transfer input");
  }
  const record = value as Record<string, unknown>;
  if ("downloadUrl" in record || "url" in record || "previewUrl" in record) {
    throw new Error("Client-supplied artifact URLs are not allowed");
  }
}

describe("expert remote transfer validation", () => {
  // @lat: [[expert-execution-tests#Rejects client artifact URLs]]
  it("rejects client-supplied download URLs in artifact payloads", () => {
    expect(() =>
      rejectClientArtifactUrls({
        artifactId: "a1",
        downloadUrl: "http://evil.test/x",
      }),
    ).toThrow(/not allowed/);
    expect(() =>
      rejectClientArtifactUrls({
        artifactId: "a1",
        url: "http://evil.test/x",
      }),
    ).toThrow(/not allowed/);
    expect(() => rejectClientArtifactUrls({ artifactId: "a1" })).not.toThrow();
  });
});
