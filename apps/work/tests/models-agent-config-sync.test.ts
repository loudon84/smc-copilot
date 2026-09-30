import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Catalog reads must not copy custom_providers rows or API keys into the
 * desktop library. Registry intake is saveNamedProvider, not listModels.
 */

let testHome: string;

async function freshModels(): Promise<typeof import("../src/main/models")> {
  vi.resetModules();
  vi.stubEnv("HERMES_HOME", testHome);
  return await import("../src/main/models");
}

function writeCustomProviders(): void {
  writeFileSync(
    join(testHome, "config.yaml"),
    [
      "custom_providers:",
      '  - name: "Faab AI"',
      '    base_url: "https://faab.ai/v1"',
      '    model: "faab-large"',
      '    api_key: "sk-faab"',
      "",
    ].join("\n"),
  );
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "hermes-models-sync-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(testHome, { recursive: true, force: true });
});

describe("agent-config model sync", () => {
  it("does not merge custom_providers into the catalog on read", async () => {
    const models = await freshModels();
    models.listModels();
    writeCustomProviders();
    const merged = models.listModels();
    expect(merged.some((m) => m.model === "faab-large")).toBe(false);
    expect(existsSync(join(testHome, ".env"))).toBe(false);
  });

  it("does not insert rows when the catalog file already exists", async () => {
    writeFileSync(join(testHome, "models.json"), "[]");
    writeCustomProviders();
    const models = await freshModels();
    models.listModels();
    models.listModels();
    expect(JSON.parse(readFileSync(join(testHome, "models.json"), "utf-8"))).toEqual(
      [],
    );
  });
});
