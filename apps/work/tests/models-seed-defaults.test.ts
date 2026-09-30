import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const readStoredSessionSync = vi.hoisted(() => vi.fn((): { user: { id: string } } | null => null));

vi.mock("../src/main/auth/token-store", () => ({
  readStoredSessionSync,
}));

let testHome: string;

async function freshModels(): Promise<typeof import("../src/main/models")> {
  vi.resetModules();
  vi.stubEnv("HERMES_HOME", testHome);
  return import("../src/main/models");
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "hermes-models-seed-"));
  readStoredSessionSync.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(testHome, { recursive: true, force: true });
});

describe("models.json seed on first read", () => {
  it("does not write default models when nobody is logged in", async () => {
    const { listModels } = await freshModels();
    expect(listModels()).toEqual([]);
    expect(existsSync(join(testHome, "models.json"))).toBe(false);
  });

  it("writes the built-in defaults when a session is already present", async () => {
    readStoredSessionSync.mockReturnValue({ user: { id: "user-1" } });
    const { listModels } = await freshModels();
    const models = listModels();
    expect(existsSync(join(testHome, "models.json"))).toBe(true);
    expect(models.map((row) => row.provider).sort()).toEqual(
      [
        "anthropic",
        "atlascloud",
        "atlascloud",
        "atlascloud",
        "ollama-cloud",
        "openai",
        "openrouter",
      ].sort(),
    );
    const saved = JSON.parse(readFileSync(join(testHome, "models.json"), "utf-8")) as Array<{
      provider: string;
    }>;
    expect(saved).toHaveLength(7);
  });
});
