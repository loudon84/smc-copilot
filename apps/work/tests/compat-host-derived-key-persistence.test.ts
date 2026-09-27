import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Catalog reads must not copy custom_providers API keys into profile `.env`.
 * Secret writes belong to saveNamedProvider.
 */

let testHome: string;

async function freshModels(): Promise<typeof import("../src/main/models")> {
  vi.resetModules();
  vi.stubEnv("HERMES_HOME", testHome);
  return await import("../src/main/models");
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "hermes-compat-persist-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(testHome, { recursive: true, force: true });
});

describe("custom-provider env persistence — catalog read", () => {
  it("does not write secrets when listing models", async () => {
    writeFileSync(
      join(testHome, "config.yaml"),
      [
        "custom_providers:",
        '  - name: "MyDeepseek"',
        '    provider: "custom"',
        '    model: "deepseek-chat"',
        '    base_url: "https://api.deepseek.com/v1"',
        '    api_key: "sk-deepseek-test-123"',
        "",
      ].join("\n"),
      "utf-8",
    );
    const { listModels } = await freshModels();
    listModels();
    expect(existsSync(join(testHome, ".env"))).toBe(false);
  });
});
