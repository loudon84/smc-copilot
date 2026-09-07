import { describe, expect, it } from "vitest";
import type { SkillRunFeatureMode } from "../../../../shared/skill-run";
import {
  shouldMountExpertDefaultEntry,
  shouldSubmitNewExpertStart,
} from "./expertDefaultEntry";

const MODES: SkillRunFeatureMode[] = [
  "expert-compat",
  "skill-first",
  "local-only",
];

describe("shouldMountExpertDefaultEntry", () => {
  it("is true only for expert-compat outside skill-run mode", () => {
    expect(
      shouldMountExpertDefaultEntry({
        isSkillRunMode: false,
        featureMode: "expert-compat",
      }),
    ).toBe(true);
  });

  it.each(["skill-first", "local-only"] as const)(
    "hides the default entry in %s even when not skill-run mode",
    (featureMode) => {
      expect(
        shouldMountExpertDefaultEntry({
          isSkillRunMode: false,
          featureMode,
        }),
      ).toBe(false);
    },
  );

  it.each(MODES)("never mounts in skill-run mode for %s", (featureMode) => {
    expect(
      shouldMountExpertDefaultEntry({
        isSkillRunMode: true,
        featureMode,
      }),
    ).toBe(false);
  });

  it("fail-closes to hidden when feature mode is unknown", () => {
    expect(
      shouldMountExpertDefaultEntry({
        isSkillRunMode: false,
        featureMode: null,
      }),
    ).toBe(false);
  });
});

describe("shouldSubmitNewExpertStart", () => {
  it.each(["skill-first", "local-only"] as const)(
    "is false for %s even with leftover expert selection",
    (featureMode) => {
      expect(
        shouldSubmitNewExpertStart({
          featureMode,
          hasLeftoverExpertSelection: true,
        }),
      ).toBe(false);
    },
  );

  it("is true for expert-compat when leftover expert selection exists", () => {
    expect(
      shouldSubmitNewExpertStart({
        featureMode: "expert-compat",
        hasLeftoverExpertSelection: true,
      }),
    ).toBe(true);
  });

  it("is false for expert-compat without leftover expert selection", () => {
    expect(
      shouldSubmitNewExpertStart({
        featureMode: "expert-compat",
        hasLeftoverExpertSelection: false,
      }),
    ).toBe(false);
  });

  it("fail-closes when feature mode is unknown even with leftover selection", () => {
    expect(
      shouldSubmitNewExpertStart({
        featureMode: null,
        hasLeftoverExpertSelection: true,
      }),
    ).toBe(false);
  });
});
