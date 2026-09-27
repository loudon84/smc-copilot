// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchLegacyProvider } from "./legacy-identity";

const registry = [
  {
    providerKey: "company",
    name: "Company",
    baseUrl: "https://new.example/v1",
  },
  {
    providerKey: "other",
    name: "Other",
    baseUrl: "https://other.example/v1",
  },
];

describe("matchLegacyProvider", () => {
  it("matches a registry providerKey and a builtin slug", () => {
    expect(
      matchLegacyProvider({
        provider: "company",
        registry,
        builtinSlugs: ["openai"],
      }),
    ).toEqual({ ok: true, providerRef: "named:company" });
    expect(
      matchLegacyProvider({
        provider: "openai",
        registry,
        builtinSlugs: ["openai"],
      }),
    ).toEqual({ ok: true, providerRef: "builtin:openai" });
  });

  it("matches one baseUrl only inside migration", () => {
    expect(
      matchLegacyProvider({
        provider: "custom",
        baseUrl: "https://new.example/v1",
        registry,
      }),
    ).toEqual({ ok: true, providerRef: "named:company" });
  });

  it("blocks zero and multiple baseUrl matches", () => {
    expect(
      matchLegacyProvider({
        provider: "custom",
        baseUrl: "https://missing.example/v1",
        registry,
      }),
    ).toEqual({ ok: false, error: "SESSION_PROVIDER_UNRESOLVED" });
    expect(
      matchLegacyProvider({
        provider: "custom",
        baseUrl: "https://shared.example/v1",
        registry: [
          { providerKey: "a", name: "A", baseUrl: "https://shared.example/v1" },
          { providerKey: "b", name: "B", baseUrl: "https://shared.example/v1" },
        ],
      }),
    ).toEqual({ ok: false, error: "PROVIDER_IDENTITY_AMBIGUOUS" });
  });
});
