import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/check-business-module-ui-boundary.mjs";

describe("business module UI boundary", () => {
  it("passes on the production tree", () => {
    const output = execFileSync(process.execPath, [SCRIPT], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(output).toContain("OK");
  });

  it("fails when a Hermes component fixture imports the Kit", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [SCRIPT, "--probe", "tests/fixtures/boundary-violation-app-modal.tsx"],
        { cwd: process.cwd(), encoding: "utf8" },
      ),
    ).toThrowError(/BUSINESS_MODULE_UI_BOUNDARY_VIOLATION/);
  });
});
