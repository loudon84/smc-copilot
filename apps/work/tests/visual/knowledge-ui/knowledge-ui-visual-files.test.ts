import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REQUIRED = [
  "bases-card-1440-light.png",
  "bases-card-1440-dark.png",
  "bases-card-2048-light.png",
  "bases-card-2048-dark.png",
  "base-detail-1440-light.png",
  "base-detail-1440-dark.png",
  "base-detail-2048-light.png",
  "base-detail-2048-dark.png",
];

const baselineDir = join(import.meta.dirname, "baselines");

describe("A-VIS-001 Knowledge UI baselines", () => {
  it("has exactly the 8 required card PNG filenames", () => {
    expect(existsSync(baselineDir)).toBe(true);
    const names = readdirSync(baselineDir)
      .filter((name) => name.endsWith(".png"))
      .sort();
    expect(names).toEqual([...REQUIRED].sort());
  });
});
