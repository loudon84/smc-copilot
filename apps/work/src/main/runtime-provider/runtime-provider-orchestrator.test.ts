import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const restart = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../runtime/runtime-manager", () => ({
  getRuntimeManager: () => ({ restart }),
}));

vi.mock("./nodeskclaw-bootstrap-client", () => ({
  fetchRuntimeBootstrap: () => fetchMock(),
}));

let testHome: string;

function ready(revision: string, apiKey = "member-key") {
  return {
    ok: true,
    contract: {
      ready: true,
      state: "READY",
      revision,
      provider: "new-api",
      baseUrl: "https://models.example.test/v1",
      apiKey,
      defaultModel: "enterprise-a",
      models: [
        { id: "enterprise-a", displayName: "Enterprise A" },
        { id: "enterprise-b", displayName: "Enterprise B" },
      ],
    },
  };
}

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "runtime-provider-orchestrator-"));
  vi.stubEnv("HERMES_HOME", testHome);
  restart.mockClear();
  fetchMock.mockReset();
  writeFileSync(
    join(testHome, "config.yaml"),
    "model:\n  provider: openai\n  default: gpt-4\n",
  );
});

afterEach(async () => {
  const { clearRuntimeProvider } = await import("./runtime-provider-orchestrator");
  const { clearManagedSecret } = await import("./managed-runtime-secret-store");
  await clearRuntimeProvider("logout");
  clearManagedSecret();
  vi.unstubAllEnvs();
  vi.resetModules();
  rmSync(testHome, { recursive: true, force: true });
});

describe("runtime provider orchestrator", () => {
  it("applies once and treats the same revision as a no-op", async () => {
    fetchMock.mockResolvedValue(ready("rev-1"));
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const first = await bootstrapRuntimeProvider("login");
    const digest = readFileSync(join(testHome, "config.yaml"), "utf-8");
    const second = await bootstrapRuntimeProvider("refresh");
    expect(first.state).toBe("ACTIVE");
    expect(second.state).toBe("ACTIVE");
    expect(restart).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).toBe(digest);
    expect(digest).not.toContain("member-key");
  });

  it("rotates the memory secret without rewriting files", async () => {
    fetchMock.mockResolvedValueOnce(ready("rev-1", "member-key"));
    fetchMock.mockResolvedValueOnce(ready("rev-1", "rotated-key"));
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const { applyManagedRuntimeSecretOverlay } = await import(
      "./managed-runtime-secret-store"
    );
    await bootstrapRuntimeProvider("login");
    const digest = readFileSync(join(testHome, "providers.json"), "utf-8");
    const next = await bootstrapRuntimeProvider("refresh");
    expect(next.state).toBe("ACTIVE");
    expect(readFileSync(join(testHome, "providers.json"), "utf-8")).toBe(digest);
    expect(restart).toHaveBeenCalledTimes(2);
    expect(
      applyManagedRuntimeSecretOverlay({}).NODESKCLAW_RUNTIME_MODEL_API_KEY,
    ).toBe("rotated-key");
    expect(digest).not.toContain("rotated-key");
  });

  it("keeps the projection and drops the secret on NOT_READY", async () => {
    fetchMock.mockResolvedValueOnce(ready("rev-1"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      contract: {
        ready: false,
        state: "MODEL_CREDENTIAL_DISABLED",
        revision: null,
      },
    });
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const { applyManagedRuntimeSecretOverlay } = await import(
      "./managed-runtime-secret-store"
    );
    await bootstrapRuntimeProvider("login");
    const digest = readFileSync(join(testHome, "config.yaml"), "utf-8");
    const next = await bootstrapRuntimeProvider("refresh");
    expect(next).toMatchObject({
      state: "NOT_READY",
      backendState: "MODEL_CREDENTIAL_DISABLED",
    });
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).toBe(digest);
    expect(
      applyManagedRuntimeSecretOverlay({
        NODESKCLAW_RUNTIME_MODEL_API_KEY: "stale",
      }).NODESKCLAW_RUNTIME_MODEL_API_KEY,
    ).toBeUndefined();
  });

  it("keeps the previous secret when transport fails after ACTIVE", async () => {
    fetchMock.mockResolvedValueOnce(ready("rev-1"));
    fetchMock.mockResolvedValueOnce({
      ok: false,
      error: "RUNTIME_BOOTSTRAP_UNAVAILABLE",
    });
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const { applyManagedRuntimeSecretOverlay } = await import(
      "./managed-runtime-secret-store"
    );
    await bootstrapRuntimeProvider("login");
    const digest = readFileSync(join(testHome, "config.yaml"), "utf-8");
    const next = await bootstrapRuntimeProvider("refresh");
    expect(next.state).toBe("STALE_ACTIVE");
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).toBe(digest);
    expect(
      applyManagedRuntimeSecretOverlay({}).NODESKCLAW_RUNTIME_MODEL_API_KEY,
    ).toBe("member-key");
  });

  it("rolls back the projection when gateway restart fails", async () => {
    restart.mockResolvedValueOnce({ ok: false });
    fetchMock.mockResolvedValue(ready("rev-1"));
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const { applyManagedRuntimeSecretOverlay } = await import(
      "./managed-runtime-secret-store"
    );
    const before = readFileSync(join(testHome, "config.yaml"), "utf-8");
    const next = await bootstrapRuntimeProvider("login");
    expect(next).toMatchObject({
      state: "ERROR",
      errorCode: "RUNTIME_GATEWAY_RESTART_FAILED",
    });
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).toBe(before);
    expect(
      applyManagedRuntimeSecretOverlay({}).NODESKCLAW_RUNTIME_MODEL_API_KEY,
    ).toBeUndefined();
  });

  it("restores the adopted model on logout and keeps the projection", async () => {
    fetchMock.mockResolvedValue(ready("rev-1"));
    const { bootstrapRuntimeProvider, clearRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    await bootstrapRuntimeProvider("login");
    const { isRuntimeSettingsLocked } = await import(
      "./runtime-provider-orchestrator"
    );
    expect(isRuntimeSettingsLocked()).toBe(true);
    await clearRuntimeProvider("logout");
    expect(isRuntimeSettingsLocked()).toBe(false);
    const config = readFileSync(join(testHome, "config.yaml"), "utf-8");
    expect(config).toContain('provider: "openai"');
    expect(config).toContain("nodeskclaw:");
  });
});
