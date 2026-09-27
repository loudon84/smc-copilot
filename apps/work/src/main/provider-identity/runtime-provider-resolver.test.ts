// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  generateProviderKey,
  providerKeyEnv,
  providerRef,
} from "./provider-ref";
import { resolveRuntimeProvider } from "./runtime-provider-resolver";

const model = "deepseek-v4-flash";

describe("providerKey", () => {
  it("canonicalizes a display name into an immutable key", () => {
    expect(generateProviderKey("  Company  New API!  ", "id-1", [])).toEqual({
      ok: true,
      providerKey: "company-new-api",
    });
  });

  it("falls back to the record id when the name has no usable characters", () => {
    const result = generateProviderKey("!!!", "aabbccddeeff-not-hex", []);
    expect(result).toEqual({
      ok: true,
      providerKey: "custom-aabbccddeeff",
    });
  });

  it("blocks an exact collision", () => {
    expect(generateProviderKey("Localhost", "id-2", ["localhost"])).toEqual({
      ok: false,
      error: "PROVIDER_KEY_CONFLICT",
    });
  });
});

describe("providerKeyEnv", () => {
  it("derives PROVIDER_<KEY>_API_KEY and rewrites dots and dashes", () => {
    expect(providerKeyEnv("company.new-api")).toBe(
      "PROVIDER_COMPANY_NEW_API_API_KEY",
    );
  });
});

describe("resolveRuntimeProvider", () => {
  const registry = [
    {
      providerKey: "localhost",
      baseUrl: "http://127.0.0.1:3000/v1",
      keyEnv: "PROVIDER_LOCALHOST_API_KEY",
      apiMode: "chat_completions" as const,
    },
    {
      providerKey: "other",
      baseUrl: "http://127.0.0.1:3000/v1",
      keyEnv: "",
      apiMode: "chat_completions" as const,
    },
  ];

  it("returns the same named-config route for gateway and dashboard callers", () => {
    const input = {
      providerRef: providerRef("named", "localhost"),
      model,
      registry,
    };
    const gateway = resolveRuntimeProvider(input);
    const dashboard = resolveRuntimeProvider(input);
    expect(gateway).toEqual(dashboard);
    expect(gateway).toMatchObject({
      ok: true,
      route: {
        providerRef: "named:localhost",
        hermesProvider: "localhost",
        model,
        strategy: "named-config",
        baseUrl: null,
        keyEnv: "PROVIDER_LOCALHOST_API_KEY",
        apiMode: "chat_completions",
        source: "canonical",
      },
    });
    expect(JSON.stringify(gateway)).not.toContain('"hermesProvider":"custom"');
  });

  it("resolves a builtin slug without using baseUrl", () => {
    expect(
      resolveRuntimeProvider({
        providerRef: "builtin:openai",
        model: "gpt-4o",
        registry,
      }),
    ).toMatchObject({
      ok: true,
      route: {
        hermesProvider: "openai",
        strategy: "builtin",
        baseUrl: null,
      },
    });
  });

  it("does not pick a provider by shared baseUrl", () => {
    expect(
      resolveRuntimeProvider({
        providerRef: "named:missing",
        model,
        registry,
        baseUrl: "http://127.0.0.1:3000/v1",
      }),
    ).toEqual({ ok: false, error: "PROVIDER_ROUTE_UNRESOLVED" });
  });

  it("rejects bare custom and custom:<name> instead of falling back", () => {
    expect(
      resolveRuntimeProvider({
        providerRef: "custom",
        model,
        registry,
      }),
    ).toEqual({ ok: false, error: "PROVIDER_ROUTE_UNRESOLVED" });
    expect(
      resolveRuntimeProvider({
        providerRef: "custom:legacy",
        model,
        registry,
      }),
    ).toEqual({ ok: false, error: "PROVIDER_ROUTE_UNRESOLVED" });
  });
});
