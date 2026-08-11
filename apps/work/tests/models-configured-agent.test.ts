import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let testHome: string;

async function freshModels(): Promise<typeof import("../src/main/models")> {
  vi.resetModules();
  vi.stubEnv("HERMES_HOME", testHome);
  return await import("../src/main/models");
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "hermes-configured-models-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(testHome, { recursive: true, force: true });
});

// @lat: [[model-selection#Session model override#Strict chat picker from agent config]]
describe("listConfiguredAgentModels", () => {
  it("returns only model.default and custom_providers, ignoring models.json", async () => {
    writeFileSync(
      join(testHome, "config.yaml"),
      [
        "model:",
        '  provider: "deepseek"',
        '  default: "deepseek-chat"',
        '  base_url: ""',
        "custom_providers:",
        '  - name: "Faab AI"',
        '    base_url: "https://faab.ai/v1"',
        '    model: "faab-large"',
        "",
      ].join("\n"),
    );
    // Seed a large library that must NOT appear in the strict picker.
    writeFileSync(
      join(testHome, "models.json"),
      JSON.stringify([
        {
          id: "seed-openrouter",
          name: "OpenRouter",
          provider: "openrouter",
          model: "openrouter/auto",
          baseUrl: "https://openrouter.ai/api/v1",
          createdAt: 1,
        },
      ]),
    );

    const models = await freshModels();
    const configured = models.listConfiguredAgentModels();
    expect(configured.map((m) => m.model).sort()).toEqual([
      "deepseek-chat",
      "faab-large",
    ]);
    expect(configured.some((m) => m.model === "openrouter/auto")).toBe(false);
  });

  it("dedupes when custom_providers mirrors model.default", async () => {
    writeFileSync(
      join(testHome, "config.yaml"),
      [
        "model:",
        '  provider: "custom"',
        '  default: "faab-large"',
        '  base_url: "https://faab.ai/v1"',
        "custom_providers:",
        '  - name: "Faab AI"',
        '    base_url: "https://faab.ai/v1"',
        '    model: "faab-large"',
        "",
      ].join("\n"),
    );

    const models = await freshModels();
    const configured = models.listConfiguredAgentModels();
    expect(configured).toHaveLength(1);
    expect(configured[0].model).toBe("faab-large");
  });

  it("expands nested models: map under each custom_providers entry", async () => {
    writeFileSync(
      join(testHome, "config.yaml"),
      [
        "custom_providers:",
        "- name: deepseek",
        "  base_url: https://api.deepseek.com/v1",
        "  model: deepseek-v4-pro",
        "  models:",
        "    deepseek-v4-pro:",
        "      context_length: 262144",
        "    deepseek-v4-flash:",
        "      context_length: 262144",
        "- name: localhost",
        "  base_url: http://127.0.0.1:3900/v1",
        "  model: qwen3.7-max",
        "",
      ].join("\n"),
    );

    const models = await freshModels();
    const configured = models.listConfiguredAgentModels();
    expect(configured.map((m) => m.model).sort()).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "qwen3.7-max",
    ]);
  });
});
