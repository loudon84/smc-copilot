// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  prepareLocalChatRoute,
  redactRouteLog,
} from "./local-migrate-and-send";

const registry = [
  {
    providerKey: "company",
    baseUrl: "https://new.example/v1",
    keyEnv: "PROVIDER_COMPANY_API_KEY",
    apiMode: "chat_completions" as const,
  },
];
const legacyRegistry = [
  {
    providerKey: "company",
    name: "Company",
    baseUrl: "https://new.example/v1",
  },
];

describe("prepareLocalChatRoute", () => {
  it("leaves remote custom traffic unchanged", async () => {
    await expect(
      prepareLocalChatRoute({
        mode: "ssh",
        model: "m",
        provider: "custom",
        source: "session",
        registry,
        legacyRegistry,
        projectionOk: false,
      }),
    ).resolves.toEqual({ ok: true, action: "passthrough" });
  });

  it("sends named-config after a unique legacy match, fill, and restart", async () => {
    const restart = vi.fn(async () => true);
    const fillProjection = vi.fn(async () => ({ wrote: true }));
    let requests = 0;
    const result = await prepareLocalChatRoute({
      mode: "local",
      model: "deepseek-v4-flash",
      provider: "custom",
      baseUrl: "https://new.example/v1",
      source: "session",
      registry,
      legacyRegistry,
      projectionOk: false,
      secretValue: "sk-live",
      fillProjection,
      restart,
    });
    if (result.ok && result.action === "send") requests = result.requests;
    expect(fillProjection).toHaveBeenCalledOnce();
    expect(restart).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      action: "send",
      hermesProvider: "company",
      strategy: "named-config",
    });
    expect(requests).toBe(1);
    expect(JSON.stringify(result)).not.toContain("sk-live");
  });

  it("does not call restart or report a request when the secret is missing", async () => {
    const restart = vi.fn(async () => true);
    const result = await prepareLocalChatRoute({
      mode: "local",
      model: "deepseek-v4-flash",
      providerRef: "named:company",
      provider: "company",
      source: "session",
      registry,
      legacyRegistry,
      projectionOk: true,
      secretValue: "",
      restart,
    });
    expect(result).toEqual({
      ok: false,
      error: "PROVIDER_SECRET_MISSING",
      requests: 0,
    });
    expect(restart).not.toHaveBeenCalled();
  });

  it("keeps committed files and sends nothing when restart fails", async () => {
    const result = await prepareLocalChatRoute({
      mode: "local",
      model: "deepseek-v4-flash",
      providerRef: "named:company",
      provider: "company",
      source: "session",
      registry,
      legacyRegistry,
      projectionOk: true,
      secretValue: "sk-live",
      wroteProjection: true,
      gatewayLoadedProjection: false,
      restart: async () => false,
    });
    expect(result).toEqual({
      ok: false,
      error: "PROVIDER_RUNTIME_RELOAD_FAILED",
      requests: 0,
    });
  });

  it("blocks an ambiguous legacy session and an unresolved global model", async () => {
    const shared = [
      { providerKey: "a", name: "A", baseUrl: "https://shared.example/v1" },
      { providerKey: "b", name: "B", baseUrl: "https://shared.example/v1" },
    ];
    await expect(
      prepareLocalChatRoute({
        mode: "local",
        model: "m",
        provider: "custom",
        baseUrl: "https://shared.example/v1",
        source: "session",
        registry: [],
        legacyRegistry: shared,
        projectionOk: true,
      }),
    ).resolves.toMatchObject({
      error: "PROVIDER_IDENTITY_AMBIGUOUS",
      requests: 0,
    });
    await expect(
      prepareLocalChatRoute({
        mode: "local",
        model: "m",
        provider: "custom",
        baseUrl: "https://missing.example/v1",
        source: "active-model",
        registry: [],
        legacyRegistry,
        projectionOk: true,
      }),
    ).resolves.toMatchObject({
      error: "ACTIVE_MODEL_PROVIDER_UNRESOLVED",
      requests: 0,
    });
  });

  it("skips restart when this process already loaded the projection", async () => {
    const restart = vi.fn(async () => true);
    const result = await prepareLocalChatRoute({
      mode: "local",
      model: "deepseek-v4-flash",
      providerRef: "named:company",
      provider: "company",
      source: "session",
      registry,
      legacyRegistry,
      projectionOk: true,
      secretValue: "sk-live",
      wroteProjection: false,
      gatewayLoadedProjection: true,
      restart,
    });
    expect(result).toMatchObject({ ok: true, action: "send" });
    expect(restart).not.toHaveBeenCalled();
  });
});

describe("redactRouteLog", () => {
  it("removes secret values from route evidence", () => {
    const text = redactRouteLog(
      {
        providerRef: "named:company",
        strategy: "named-config",
        note: "sk-live",
      },
      "sk-live",
    );
    expect(text).toContain("named:company");
    expect(text).not.toContain("sk-live");
  });
});
