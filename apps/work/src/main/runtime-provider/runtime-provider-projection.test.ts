import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testHome: string;

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "runtime-provider-projection-"));
  vi.stubEnv("HERMES_HOME", testHome);
  writeFileSync(
    join(testHome, "config.yaml"),
    "model:\n  provider: openai\n  default: gpt-4\n",
  );
  writeFileSync(
    join(testHome, "models.json"),
    JSON.stringify([
      {
        id: "local-1",
        name: "Local",
        provider: "openai",
        model: "gpt-4",
        baseUrl: "",
        createdAt: 1,
      },
    ]),
  );
  writeFileSync(
    join(testHome, "providers.json"),
    JSON.stringify({ version: 2, providers: [] }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  rmSync(testHome, { recursive: true, force: true });
});

describe("managed runtime projection", () => {
  it("writes the secret-free nodeskclaw projection and keeps unrelated rows", async () => {
    const { projectManagedRuntime } = await import("./runtime-provider-projection");
    const result = projectManagedRuntime(undefined, {
      baseUrl: "https://models.example.test/v1",
      defaultModel: "enterprise-a",
      models: [
        { id: "enterprise-a", displayName: "Enterprise A" },
        { id: "enterprise-b", displayName: "Enterprise B" },
      ],
    });
    expect(result.ok).toBe(true);
    const config = readFileSync(join(testHome, "config.yaml"), "utf-8");
    const providers = readFileSync(join(testHome, "providers.json"), "utf-8");
    const models = JSON.parse(readFileSync(join(testHome, "models.json"), "utf-8"));
    const adoption = JSON.parse(
      readFileSync(join(testHome, "runtime-provider-adoption.json"), "utf-8"),
    );
    expect(config).toContain("nodeskclaw:");
    expect(config).toContain("https://models.example.test/v1");
    expect(config).not.toContain("member-secret");
    expect(providers).not.toContain("api_key");
    expect(providers).toContain("NODESKCLAW_RUNTIME_MODEL_API_KEY");
    expect(adoption).toEqual({ provider: "openai", model: "gpt-4" });
    expect(models.some((row: { id: string }) => row.id === "local-1")).toBe(true);
    expect(
      models
        .filter((row: { providerRef?: string }) => row.providerRef === "named:nodeskclaw")
        .map((row: { model: string }) => row.model)
        .sort(),
    ).toEqual(["enterprise-a", "enterprise-b"]);
    expect(config).toContain('provider: "nodeskclaw"');
    expect(config).toContain('default: "enterprise-a"');
  });

  it("refuses an occupied provider key with zero mutation", async () => {
    writeFileSync(
      join(testHome, "providers.json"),
      JSON.stringify({
        version: 2,
        providers: [
          {
            id: "occupied",
            name: "Other",
            baseUrl: "https://other.test",
            createdAt: 1,
            providerKey: "nodeskclaw",
            keyEnv: "OPENAI_API_KEY",
          },
        ],
      }),
    );
    const before = readFileSync(join(testHome, "providers.json"), "utf-8");
    const { projectManagedRuntime } = await import("./runtime-provider-projection");
    const result = projectManagedRuntime(undefined, {
      baseUrl: "https://models.example.test/v1",
      defaultModel: "enterprise-a",
      models: [{ id: "enterprise-a", displayName: "Enterprise A" }],
    });
    expect(result.ok).toBe(false);
    expect(readFileSync(join(testHome, "providers.json"), "utf-8")).toBe(before);
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).not.toContain(
      "nodeskclaw",
    );
  });
});
