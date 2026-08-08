import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PRD v1.3.1 Case 5 / Network E2E static guard:
 * Startup decision path must never reference Hermes gateway :8642 or remote Hermes URLs.
 */
describe("startup network boundary (static)", () => {
  const root = join(__dirname, "../src");

  const files = [
    "main/startup/startup-decision.ts",
    "main/startup/desktop-boot-coordinator.ts",
    "main/startup/startup-ipc.ts",
    "renderer/src/hooks/useStartupGate.ts",
    "renderer/src/App.tsx",
    "shared/startup/startup-contract.ts",
  ];

  it("startup sources do not mention Hermes gateway port 8642", () => {
    for (const rel of files) {
      const text = readFileSync(join(root, rel), "utf8");
      expect(text, rel).not.toMatch(/8642/);
      expect(text, rel).not.toMatch(/testRemoteConnection/);
      expect(text, rel).not.toMatch(/verifyInstall/);
      expect(text, rel).not.toMatch(/getConnectionConfig/);
      expect(text, rel).not.toMatch(/\/v1\/chat\/completions/);
    }
  });

  it("boot coordinator targets Runtime Serve base URL semantics", () => {
    const text = readFileSync(join(root, "main/startup/desktop-boot-coordinator.ts"), "utf8");
    expect(text).toMatch(/initCopilotRuntimeConnection|runRuntimeHandshake|resolveServeBaseUrl/);
  });
});
