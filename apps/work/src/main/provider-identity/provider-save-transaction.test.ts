// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
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

describe("saveNamedProvider", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-provider-save-"));
    vi.resetModules();
    delete process.env.HERMES_PROFILE;
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
    delete process.env.HERMES_PROFILE;
  });

  async function txn(): Promise<typeof import("./provider-save-transaction")> {
    return import("./provider-save-transaction");
  }

  it("writes registry v2, .env secret, and providers projection", async () => {
    const { saveNamedProvider } = await txn();
    const saved = saveNamedProvider({
      profile: "default",
      name: "Company New API",
      baseUrl: "https://new.example/v1",
      secret: "sk-super-secret",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.record.providerKey).toBe("company-new-api");
    expect(saved.record.keyEnv).toBe("PROVIDER_COMPANY_NEW_API_API_KEY");
    expect(saved.record.apiMode).toBe("chat_completions");

    const providers = readFileSync(
      join(mockState.hermesHome, "providers.json"),
      "utf-8",
    );
    const config = readFileSync(
      join(mockState.hermesHome, "config.yaml"),
      "utf-8",
    );
    const env = readFileSync(join(mockState.hermesHome, ".env"), "utf-8");
    expect(providers).toContain('"version": 2');
    expect(providers).not.toContain("sk-super-secret");
    expect(config).toContain("company-new-api:");
    expect(config).toContain("PROVIDER_COMPANY_NEW_API_API_KEY");
    expect(config).not.toContain("sk-super-secret");
    expect(env).toContain(
      "PROVIDER_COMPANY_NEW_API_API_KEY=sk-super-secret",
    );
    expect(existsSync(join(mockState.hermesHome, "models.json"))).toBe(false);
  });

  it("keeps providerKey when the display name changes", async () => {
    const { saveNamedProvider } = await txn();
    const first = saveNamedProvider({
      profile: "default",
      name: "Company",
      baseUrl: "https://new.example/v1",
    });
    if (!first.ok) throw new Error(first.error);
    const second = saveNamedProvider({
      profile: "default",
      id: first.record.id,
      name: "Renamed Company",
      baseUrl: "https://new.example/v1",
    });
    expect(second).toMatchObject({
      ok: true,
      record: { providerKey: first.record.providerKey, name: "Renamed Company" },
    });
  });

  it("rejects an apiMode outside the closed set with zero writes", async () => {
    const { saveNamedProvider } = await txn();
    expect(
      saveNamedProvider({
        profile: "default",
        name: "Company",
        baseUrl: "https://new.example/v1",
        apiMode: "websocket",
      }),
    ).toEqual({ ok: false, error: "PROVIDER_API_MODE_INVALID" });
    expect(existsSync(join(mockState.hermesHome, "providers.json"))).toBe(
      false,
    );
  });

  it("blocks keyEnv collision between a.b and a_b", async () => {
    const { saveNamedProvider } = await txn();
    const first = saveNamedProvider({
      profile: "default",
      name: "a.b",
      baseUrl: "https://a.example/v1",
    });
    expect(first.ok).toBe(true);
    expect(
      saveNamedProvider({
        profile: "default",
        name: "a_b",
        baseUrl: "https://b.example/v1",
      }),
    ).toEqual({ ok: false, error: "PROVIDER_KEYENV_CONFLICT" });
  });

  it("rolls registry back when projection throws", async () => {
    const { saveNamedProvider } = await txn();
    const result = saveNamedProvider(
      {
        profile: "default",
        name: "Company",
        baseUrl: "https://new.example/v1",
        secret: "sk-super-secret",
      },
      {
        project: () => {
          throw new Error("disk full");
        },
      },
    );
    expect(result).toEqual({
      ok: false,
      error: "PROVIDER_SAVE_TRANSACTION_FAILED",
    });
    expect(existsSync(join(mockState.hermesHome, "providers.json"))).toBe(
      false,
    );
    expect(existsSync(join(mockState.hermesHome, ".env"))).toBe(false);
  });

  it("writes the explicit profile, not HERMES_PROFILE", async () => {
    process.env.HERMES_PROFILE = "coder";
    const { saveNamedProvider } = await txn();
    const saved = saveNamedProvider({
      profile: "default",
      name: "Company",
      baseUrl: "https://new.example/v1",
    });
    expect(saved.ok).toBe(true);
    expect(existsSync(join(mockState.hermesHome, "providers.json"))).toBe(
      true,
    );
    expect(
      existsSync(
        join(mockState.hermesHome, "profiles", "coder", "providers.json"),
      ),
    ).toBe(false);
  });

  it("rejects an invalid explicit profile before writing", async () => {
    const { saveNamedProvider } = await txn();
    expect(
      saveNamedProvider({
        profile: "Not A Profile",
        name: "Company",
        baseUrl: "https://new.example/v1",
      }),
    ).toEqual({ ok: false, error: "PROFILE_SCOPE_MISMATCH" });
    expect(existsSync(join(mockState.hermesHome, "providers.json"))).toBe(
      false,
    );
  });

  it("migrates a v1 record in place and keeps its UUID", async () => {
    writeFileSync(
      join(mockState.hermesHome, "providers.json"),
      JSON.stringify({
        version: 1,
        providers: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Company",
            baseUrl: "https://new.example/v1",
            createdAt: 10,
          },
        ],
      }),
    );
    const { migrateRegistryToV2 } = await txn();
    const [result] = migrateRegistryToV2("default");
    expect(result).toMatchObject({
      ok: true,
      record: {
        id: "11111111-1111-4111-8111-111111111111",
        providerKey: "company",
      },
    });
    const raw = readFileSync(
      join(mockState.hermesHome, "providers.json"),
      "utf-8",
    );
    expect(raw).toContain("11111111-1111-4111-8111-111111111111");
    expect(raw).toContain('"version": 2');
  });
});
