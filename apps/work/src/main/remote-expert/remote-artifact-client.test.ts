import { describe, expect, it } from "vitest";
import {
  assertDownloadPathMatches,
  parseArtifactResourceUri,
  publicArtifactPath,
} from "./remote-artifact-client";

describe("artifact ResourceLink", () => {
  it("[A-ARTIFACT-001] parses nodeskclaw artifact URIs", () => {
    const parsed = parseArtifactResourceUri(
      "nodeskclaw://artifact/run-1/art-2",
    );
    expect(parsed).toEqual({ runId: "run-1", artifactId: "art-2" });
  });

  it("[A-NEG-ARTIFACT-001] rejects cross-origin download paths", () => {
    expect(() =>
      assertDownloadPathMatches(
        "sales-expert",
        "run-1",
        "art-2",
        "https://evil.example/x",
      ),
    ).toThrow(/CROSS_ORIGIN_REJECTED|downloadPath/);
    expect(() =>
      assertDownloadPathMatches(
        "sales-expert",
        "run-1",
        "art-2",
        "/api/v1/hermes/artifacts/art-2",
      ),
    ).toThrow();
  });

  it("accepts the public artifact route", () => {
    const path = publicArtifactPath("sales-expert", "run-1", "art-2");
    expect(path).toBe(
      "/api/v1/remote-experts/sales-expert/acp/runs/run-1/artifacts/art-2",
    );
    expect(() =>
      assertDownloadPathMatches("sales-expert", "run-1", "art-2", path),
    ).not.toThrow();
  });
});
