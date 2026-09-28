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
  const { closeDbConnection } = await import("../db");
  await clearRuntimeProvider("logout");
  clearManagedSecret();
  closeDbConnection();
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
    expect(first.state.state).toBe("ACTIVE");
    expect(second.state.state).toBe("ACTIVE");
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
    expect(next.state.state).toBe("ACTIVE");
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
    expect(next.state).toMatchObject({
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
    expect(next.state.state).toBe("STALE_ACTIVE");
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
    expect(next.state).toMatchObject({
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

  it("rolls back session overrides with the projection when restart fails", async () => {
    restart.mockResolvedValueOnce({ ok: false });
    fetchMock.mockResolvedValue(ready("rev-1"));
    const { openSqliteDatabase } = await import("../sqlite-database");
    openSqliteDatabase(join(testHome, "state.db")).close();
    const { setSessionModelOverride, getSessionModelOverride } = await import(
      "../session-model-override-store"
    );
    const original = {
      provider: "openai",
      model: "gpt-4",
      baseUrl: "",
      providerRef: "builtin:openai",
    };
    setSessionModelOverride("chat-1", original);
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const next = await bootstrapRuntimeProvider("login");
    expect(next.state.state).toBe("ERROR");
    expect(getSessionModelOverride("chat-1")).toMatchObject(original);
  });

  it("lets a later logout finish after an older rollback fails", async () => {
    let release: (value: { ok: boolean }) => void = () => {};
    restart.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fetchMock.mockResolvedValue(ready("rev-1"));
    const projection = await import("./runtime-provider-projection");
    const { bootstrapRuntimeProvider, clearRuntimeProvider, getRuntimeProviderPublicState } =
      await import("./runtime-provider-orchestrator");
    const { applyManagedRuntimeSecretOverlay } = await import(
      "./managed-runtime-secret-store"
    );
    vi.spyOn(projection, "restoreManagedFiles").mockImplementationOnce(() => {
      throw new Error("disk");
    });
    const pending = bootstrapRuntimeProvider("login");
    await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    const logout = clearRuntimeProvider("logout");
    release({ ok: true });
    await pending;
    await logout;
    expect(getRuntimeProviderPublicState().state).toBe("UNBOUND");
    expect(
      applyManagedRuntimeSecretOverlay({}).NODESKCLAW_RUNTIME_MODEL_API_KEY,
    ).toBeUndefined();
  });

  it("repairs same-revision drift with one gateway restart and ignores conflicts", async () => {
    fetchMock.mockResolvedValue(ready("rev-1"));
    const { bootstrapRuntimeProvider, getRuntimeProviderPublicState } =
      await import("./runtime-provider-orchestrator");
    await bootstrapRuntimeProvider("login");
    const drifted = readFileSync(join(testHome, "config.yaml"), "utf-8").replace(
      'default: "enterprise-a"',
      'default: "gpt-4"',
    );
    writeFileSync(join(testHome, "config.yaml"), drifted);
    await bootstrapRuntimeProvider("refresh");
    expect(restart).toHaveBeenCalledTimes(2);
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).toContain(
      'default: "enterprise-a"',
    );
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
    const conflicted = await bootstrapRuntimeProvider("refresh");
    expect(conflicted.state).toMatchObject({
      state: "ERROR",
      errorCode: "MANAGED_PROVIDER_IDENTITY_CONFLICT",
    });
    expect(readFileSync(join(testHome, "providers.json"), "utf-8")).toBe(before);
    expect(getRuntimeProviderPublicState().state).toBe("ERROR");
  });

  it("blocks a nodeskclaw send when the memory secret is gone", async () => {
    const { gateLocalRuntimeSend } = await import("./runtime-provider-orchestrator");
    expect(
      gateLocalRuntimeSend({
        provider: "nodeskclaw",
        providerRef: "named:nodeskclaw",
        model: "enterprise-a",
      }),
    ).toEqual({ ok: false, error: "RUNTIME_NOT_READY" });
  });

  it("emits one state event per semantic change and omits secrets", async () => {
    fetchMock.mockResolvedValue(ready("rev-1"));
    const events: Array<Record<string, unknown>> = [];
    const { bootstrapRuntimeProvider, subscribeRuntimeProviderState } =
      await import("./runtime-provider-orchestrator");
    subscribeRuntimeProviderState((event) => events.push({ ...event }));
    await bootstrapRuntimeProvider("login");
    const active = events.filter((event) => event.state === "ACTIVE");
    expect(active).toHaveLength(1);
    expect(JSON.stringify(active[0])).not.toContain("member-key");
    expect(JSON.stringify(active[0])).not.toContain("api_key");
    await bootstrapRuntimeProvider("login");
    const repeated = events.filter((event) => event.state === "ACTIVE");
    expect(repeated.length).toBeGreaterThanOrEqual(1);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("member-key");
  });

  it("rejects a background fetch superseded by manual refresh", async () => {
    let release: (value: { ok: boolean }) => void = () => {};
    restart.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fetchMock.mockResolvedValue(ready("rev-1"));
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const pending = bootstrapRuntimeProvider("scheduled_reconcile");
    await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    const manual = bootstrapRuntimeProvider("refresh");
    release({ ok: true });
    const background = await pending;
    const foreground = await manual;
    expect(background.accepted).toBe(false);
    expect(foreground.accepted).toBe(true);
    expect(foreground.state.state).toBe("ACTIVE");
  });

  it("rolls back a background reconcile superseded by quit without publishing ACTIVE", async () => {
    let release: (value: { ok: boolean }) => void = () => {};
    restart.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fetchMock.mockResolvedValue(ready("rev-1"));
    const events: string[] = [];
    const { bootstrapRuntimeProvider, getRuntimeProviderPublicState, subscribeRuntimeProviderState } =
      await import("./runtime-provider-orchestrator");
    const { beginRuntimeIntent } = await import(
      "./runtime-provider-operation-coordinator"
    );
    subscribeRuntimeProviderState((event) => events.push(event.state));
    const pending = bootstrapRuntimeProvider("scheduled_reconcile");
    await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    beginRuntimeIntent("app-quit");
    release({ ok: true });
    const background = await pending;
    expect(background.accepted).toBe(false);
    expect(background.outcome).toBe("superseded");
    expect(getRuntimeProviderPublicState().state).not.toBe("ACTIVE");
    expect(events.filter((state) => state === "ACTIVE")).toHaveLength(0);
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).toContain(
      "provider: openai",
    );
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).not.toContain(
      "member-key",
    );
  });
});
