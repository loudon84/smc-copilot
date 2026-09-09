import { describe, expect, it } from "vitest";
import { delimiter } from "path";
import { getEnhancedPath } from "../src/main/runtime/hermes-runtime-paths";

describe("hermes runtime platform wiring", () => {
  it("uses the platform path delimiter in the enhanced PATH", () => {
    const enhancedPath = getEnhancedPath();

    expect(enhancedPath).toContain(process.env.PATH || "");
    expect(enhancedPath.split(delimiter).length).toBeGreaterThan(1);
  });
});
