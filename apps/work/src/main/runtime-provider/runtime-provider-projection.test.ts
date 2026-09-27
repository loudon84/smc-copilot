import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSqliteDatabase } from "../sqlite-database";

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

afterEach(async () => {
  const { closeDbConnection } = await import("../db");
  closeDbConnection();
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

  it("rewrites missing metadata and keeps other-profile overrides", async () => {
    const { getDbConnection } = await import("../db");
    openSqliteDatabase(join(testHome, "state.db")).close();
    const db = getDbConnection(false);
    expect(db).toBeTruthy();
    const {
      CHAT_SESSION_CLASSIFICATION,
      SKILL_RUN_SESSION_CLASSIFICATION,
      createSessionScope,
      upsertSessionMetadata,
    } = await import("../session-metadata-store");
    const { getSessionModelOverride, setSessionModelOverride } = await import(
      "../session-model-override-store"
    );
    const scope = createSessionScope("local|default");
    upsertSessionMetadata(
      db!,
      { sessionScope: scope, profileId: "research", sessionId: "other-profile" },
      CHAT_SESSION_CLASSIFICATION,
    );
    upsertSessionMetadata(
      db!,
      { sessionScope: scope, profileId: "default", sessionId: "skill-session" },
      SKILL_RUN_SESSION_CLASSIFICATION,
    );
    const foreign = {
      provider: "openai",
      model: "keep-me",
      baseUrl: "",
      providerRef: "builtin:openai",
    };
    setSessionModelOverride("other-profile", foreign);
    setSessionModelOverride("missing-metadata", {
      provider: "openai",
      model: "old-local",
      baseUrl: "",
      providerRef: "builtin:openai",
    });
    setSessionModelOverride("skill-session", {
      provider: "openai",
      model: "old-skill",
      baseUrl: "",
      providerRef: "builtin:openai",
    });
    const { projectManagedRuntime } = await import("./runtime-provider-projection");
    const result = projectManagedRuntime(undefined, {
      baseUrl: "https://models.example.test/v1",
      defaultModel: "enterprise-a",
      models: [{ id: "enterprise-a", displayName: "Enterprise A" }],
    });
    expect(result.ok).toBe(true);
    expect(getSessionModelOverride("other-profile")).toMatchObject(foreign);
    expect(getSessionModelOverride("missing-metadata")).toMatchObject({
      providerRef: "named:nodeskclaw",
      model: "enterprise-a",
    });
    expect(getSessionModelOverride("skill-session")).toMatchObject({
      providerRef: "named:nodeskclaw",
      model: "enterprise-a",
    });
    const service = readFileSync(
      join(process.cwd(), "src/main/skill-run/skill-run-service.ts"),
      "utf-8",
    );
    expect(service).not.toContain("session-model-override-store");
    expect(service).not.toContain("desktop_session_model_overrides");
  });
});
