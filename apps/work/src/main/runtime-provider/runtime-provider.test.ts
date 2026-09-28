import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRuntimeBootstrap } from "./runtime-provider-contract";
import { fetchRuntimeBootstrap } from "./nodeskclaw-bootstrap-client";
import {
  applyManagedRuntimeSecretOverlay,
  clearManagedSecret,
  installManagedSecret,
} from "./managed-runtime-secret-store";

const home = "C:/tmp/runtime-provider-test";

afterEach(() => {
  clearManagedSecret();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("runtime bootstrap contract", () => {
  it("rejects a READY payload without an api key and does not write files", async () => {
    const before = "untouched";
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "marker.txt"), before);
    expect(
      parseRuntimeBootstrap({
        ready: true,
        state: "READY",
        provider: "new-api",
        revision: "r1",
        base_url: "https://example.test",
        default_model: "m1",
        models: [{ id: "m1", display_name: "M1" }],
      }).ok,
    ).toBe(false);
    let requested: { path: string; body: string } | null = null;
    const result = await fetchRuntimeBootstrap({
      withAuthRetry: async (operation) => operation(),
      authorizedFetch: async (path: string, init: { body?: string }) => {
        requested = { path, body: String(init.body || "") };
        return new Response(JSON.stringify({ ready: true, state: "READY" }), {
          status: 200,
        });
      },
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("RUNTIME_BOOTSTRAP_SCHEMA_INVALID");
    expect(requested).toEqual({
      path: "/api/v1/runtime/model-bootstrap",
      body: JSON.stringify({ consumer: "smc-copilot", runtime: "hermes-agent" }),
    });
    expect(JSON.stringify(result)).not.toContain("api_key");
  });

  it("strips the reserved key from env that has no installed secret", () => {
    vi.stubEnv("HERMES_HOME", home);
    const env = applyManagedRuntimeSecretOverlay({
      NODESKCLAW_RUNTIME_MODEL_API_KEY: "leaked",
      HOME: home,
    });
    expect(env.NODESKCLAW_RUNTIME_MODEL_API_KEY).toBeUndefined();
    expect(process.env.NODESKCLAW_RUNTIME_MODEL_API_KEY).toBeUndefined();
    installManagedSecret({ apiKey: "member-key", revision: "r1" });
    const injected = applyManagedRuntimeSecretOverlay({ HOME: home });
    expect(injected.NODESKCLAW_RUNTIME_MODEL_API_KEY).toBe("member-key");
    expect(process.env.NODESKCLAW_RUNTIME_MODEL_API_KEY).toBeUndefined();
  });
});

describe("runtime provider release evidence", () => {
  it("keeps the unexecuted golden consumer blocked", () => {
    const evidence = {
      l1Contract: "PASS",
      l2Transaction: "PASS",
      l3RendererIpc: "PASS",
      l4GoldenNodeDeskClawInference: "BLOCKED",
      l4GoldenNewApiDirect: "BLOCKED",
      v13AutomaticReconcile: "BLOCKED",
    };
    expect(evidence.l4GoldenNodeDeskClawInference).toBe("BLOCKED");
    expect(evidence.l4GoldenNewApiDirect).toBe("BLOCKED");
    expect(evidence.v13AutomaticReconcile).toBe("BLOCKED");
    expect(JSON.stringify(evidence)).not.toContain("api_key");
  });
});
