// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ hermesHome: "" }));

vi.mock("../installer", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

vi.mock("../runtime/hermes-runtime-paths", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

describe("provider projection", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-projection-"));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  it("blocks drift without mutating yaml", async () => {
    const yaml = [
      "providers:",
      "  company:",
      '    name: "Company"',
      '    base_url: "https://old.example/v1"',
      '    key_env: "PROVIDER_COMPANY_API_KEY"',
      '    api_mode: "chat_completions"',
      "custom_providers:",
      "- name: foreign",
      "  base_url: https://foreign.example/v1",
      "  key_env: FOREIGN_API_KEY",
      "",
    ].join("\n");
    writeFileSync(join(mockState.hermesHome, "config.yaml"), yaml);
    const { checkProviderProjection } = await import(
      "../agent-config-providers"
    );
    expect(
      checkProviderProjection(undefined, {
        providerKey: "company",
        baseUrl: "https://new.example/v1",
        keyEnv: "PROVIDER_COMPANY_API_KEY",
        apiMode: "chat_completions",
      }),
    ).toEqual({ ok: false, error: "PROVIDER_PROJECTION_DRIFT" });
    expect(readFileSync(join(mockState.hermesHome, "config.yaml"), "utf-8")).toBe(
      yaml,
    );
  });

  it("explicit re-save overwrites the desktop entry and keeps unknown custom_providers", async () => {
    writeFileSync(
      join(mockState.hermesHome, "config.yaml"),
      [
        "providers:",
        "  company:",
        '    name: "Company"',
        '    base_url: "https://old.example/v1"',
        '    key_env: "PROVIDER_COMPANY_API_KEY"',
        '    api_mode: "chat_completions"',
        "custom_providers:",
        "- name: foreign",
        "  base_url: https://foreign.example/v1",
        "  key_env: FOREIGN_API_KEY",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(mockState.hermesHome, "providers.json"),
      JSON.stringify({
        version: 2,
        providers: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Company",
            baseUrl: "https://old.example/v1",
            createdAt: 1,
            providerKey: "company",
            keyEnv: "PROVIDER_COMPANY_API_KEY",
            apiMode: "chat_completions",
          },
        ],
      }),
    );
    const { saveNamedProvider } = await import("./provider-save-transaction");
    const saved = saveNamedProvider({
      profile: "default",
      id: "22222222-2222-4222-8222-222222222222",
      name: "Company",
      baseUrl: "https://new.example/v1",
    });
    expect(saved.ok).toBe(true);
    const yaml = readFileSync(join(mockState.hermesHome, "config.yaml"), "utf-8");
    expect(yaml).toContain("https://new.example/v1");
    expect(yaml).toContain("name: foreign");
    expect(yaml).toContain("FOREIGN_API_KEY");
    const { checkProviderProjection } = await import(
      "../agent-config-providers"
    );
    expect(
      checkProviderProjection(undefined, {
        providerKey: "company",
        baseUrl: "https://new.example/v1",
        keyEnv: "PROVIDER_COMPANY_API_KEY",
        apiMode: "chat_completions",
      }),
    ).toEqual({ ok: true });
  });
});
