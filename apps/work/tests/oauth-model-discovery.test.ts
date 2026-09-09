import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for OAuth/subscription-provider model discovery.
 *
 * These providers have no static-key `/v1/models` endpoint. Work serves
 * curated catalogs only — it does not spawn Hermes Python to call
 * `provider_model_ids`.
 */

vi.mock("../src/main/config", () => ({
  readEnv: () => ({}),
}));

import {
  discoverProviderModels,
  _clearCache,
} from "../src/main/model-discovery";

describe("OAuth provider model discovery", () => {
  beforeEach(() => {
    _clearCache();
  });

  it("returns the curated openai-codex catalog without Python discovery", async () => {
    const result = await discoverProviderModels(
      "openai-codex",
      undefined,
      undefined,
      undefined,
    );
    expect(result.status).toBe("ok");
    expect(result.models).toContain("gpt-5.3-codex");
    expect(result.models).toEqual([...result.models].sort());
    expect(result.models.length).toBeGreaterThan(0);
  });

  it("returns the curated xai-oauth catalog", async () => {
    const result = await discoverProviderModels(
      "xai-oauth",
      undefined,
      undefined,
      undefined,
    );
    expect(result.models).toContain("grok-4.3");
  });

  it("returns the curated google-gemini-cli catalog", async () => {
    const result = await discoverProviderModels(
      "google-gemini-cli",
      undefined,
      undefined,
      undefined,
    );
    expect(result.models).toContain("gemini-3-pro-preview");
  });

  it("returns an empty catalog for qwen-oauth", async () => {
    const result = await discoverProviderModels(
      "qwen-oauth",
      undefined,
      undefined,
      undefined,
    );
    expect(result.status).toBe("ok");
    expect(result.models).toEqual([]);
  });

  it("caches the curated result so a second call skips re-resolution", async () => {
    const first = await discoverProviderModels(
      "openai-codex",
      undefined,
      undefined,
      undefined,
    );
    expect(first.cached).toBe(false);
    const second = await discoverProviderModels(
      "openai-codex",
      undefined,
      undefined,
      undefined,
    );
    expect(second.cached).toBe(true);
    expect(second.models).toEqual(first.models);
  });
});
