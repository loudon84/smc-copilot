import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SRC = readFileSync(
  join(ROOT, "src/main/remote-expert-acp/remote-expert-acp-isolation.test.ts"),
  "utf8",
);

describe("remote-expert-acp isolation suite is present", () => {
  it("scans the new bounded context", () => {
    expect(SRC).toContain("does not import forbidden");
    expect(SRC).toContain("src/main/remote-expert-acp");
  });
});
