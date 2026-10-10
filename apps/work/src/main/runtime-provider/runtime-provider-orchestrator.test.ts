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

  it("keeps local chat usable when restore receives an empty model list", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      contract: {
        ready: false,
        state: "MODEL_LIST_EMPTY",
        revision: null,
      },
    });
    const {
      bootstrapRuntimeProvider,
      gateLocalRuntimeSend,
      getRuntimeProviderPublicState,
      isRuntimeSettingsLocked,
    } = await import("./runtime-provider-orchestrator");
    const result = await bootstrapRuntimeProvider("restore");
    expect(result.state).toEqual({
      state: "NOT_READY",
      backendState: "MODEL_LIST_EMPTY",
    });
    expect(getRuntimeProviderPublicState()).toEqual(result.state);
    expect(isRuntimeSettingsLocked()).toBe(false);
    expect(
      gateLocalRuntimeSend({
        provider: "custom",
        providerRef: "named:localhost",
        model: "deepseek-v4-pro",
      }),
    ).toEqual({ ok: true });
    expect(
      gateLocalRuntimeSend({
        provider: "nodeskclaw",
        providerRef: "named:nodeskclaw",
        model: "enterprise-a",
      }),
    ).toEqual({ ok: false, error: "RUNTIME_NOT_READY" });
  });

  it("keeps local chat usable when restore cannot reach the backend", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      error: "RUNTIME_BOOTSTRAP_UNAVAILABLE",
    });
    const {
      bootstrapRuntimeProvider,
      gateLocalRuntimeSend,
      getRuntimeProviderPublicState,
      isRuntimeSettingsLocked,
    } = await import("./runtime-provider-orchestrator");
    const result = await bootstrapRuntimeProvider("restore");
    expect(result.outcome).toBe("deferred");
    expect(result.state).toEqual({ state: "UNBOUND" });
    expect(getRuntimeProviderPublicState()).toEqual({ state: "UNBOUND" });
    expect(isRuntimeSettingsLocked()).toBe(false);
    expect(
      gateLocalRuntimeSend({
        provider: "custom",
        providerRef: "named:localhost",
        model: "deepseek-v4-pro",
      }),
    ).toEqual({ ok: true });
    expect(
      gateLocalRuntimeSend({
        provider: "nodeskclaw",
        providerRef: "named:nodeskclaw",
        model: "enterprise-a",
      }),
    ).toEqual({ ok: false, error: "RUNTIME_NOT_READY" });
  });

  it("returns to unbound on logout when enterprise sync never captured auxiliary routes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      contract: {
        ready: false,
        state: "MODEL_LIST_EMPTY",
        revision: null,
      },
    });
    const {
      bootstrapRuntimeProvider,
      clearRuntimeProvider,
      getRuntimeProviderPublicState,
    } = await import("./runtime-provider-orchestrator");
    await bootstrapRuntimeProvider("login");
    expect(getRuntimeProviderPublicState()).toEqual({
      state: "NOT_READY",
      backendState: "MODEL_LIST_EMPTY",
    });
    await clearRuntimeProvider("logout");
    expect(getRuntimeProviderPublicState()).toEqual({ state: "UNBOUND" });
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
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 6_000);
    await bootstrapRuntimeProvider("refresh");
    vi.mocked(Date.now).mockRestore();
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
    // Must not stick in APPLYING — quit supersede settles the transient card.
    expect(getRuntimeProviderPublicState().state).not.toBe("APPLYING");
    expect(getRuntimeProviderPublicState().state).not.toBe("ACTIVE");
    expect(events.filter((state) => state === "ACTIVE")).toHaveLength(0);
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).toContain(
      "provider: openai",
    );
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).not.toContain(
      "member-key",
    );
  });

  it("maps projectManagedRuntime throw to RUNTIME_PROVIDER_PROJECT_FAILED", async () => {
    fetchMock.mockResolvedValue(ready("rev-project-boom"));
    vi.doMock("./runtime-provider-projection", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./runtime-provider-projection")>();
      return {
        ...actual,
        projectManagedRuntime: () => {
          throw new Error("project boom");
        },
      };
    });
    vi.resetModules();
    const { bootstrapRuntimeProvider, getRuntimeProviderPublicState } =
      await import("./runtime-provider-orchestrator");
    const result = await bootstrapRuntimeProvider("login");
    expect(result.state).toEqual({
      state: "ERROR",
      errorCode: "RUNTIME_PROVIDER_PROJECT_FAILED",
    });
    expect(getRuntimeProviderPublicState()).toEqual({
      state: "ERROR",
      errorCode: "RUNTIME_PROVIDER_PROJECT_FAILED",
    });
    vi.doUnmock("./runtime-provider-projection");
  });

  it("rolls back when the post-apply projection check is not a match", async () => {
    fetchMock.mockResolvedValue(ready("rev-drift"));
    const events: string[] = [];
    const {
      bootstrapRuntimeProvider,
      getLastProjectionCheck,
      setPostApplyProjectionCheckForTests,
      subscribeRuntimeProviderState,
    } = await import("./runtime-provider-orchestrator");
    setPostApplyProjectionCheckForTests(() => ({
      status: "DRIFTED",
      reasons: ["ACTIVE_DEFAULT_DRIFT"],
    }));
    subscribeRuntimeProviderState((event) => events.push(event.state));
    const result = await bootstrapRuntimeProvider("login");
    expect(result.state.state).toBe("ERROR");
    if (result.state.state === "ERROR") {
      expect(result.state.errorCode).toBe("RUNTIME_PROVIDER_POST_APPLY_DRIFT");
    }
    expect(events.filter((state) => state === "ACTIVE")).toHaveLength(0);
    expect(getLastProjectionCheck().status).toBe("DRIFTED");
  });

  it("uses the drift error when the post-apply check throws", async () => {
    fetchMock.mockResolvedValue(ready("rev-throw"));
    const { bootstrapRuntimeProvider, setPostApplyProjectionCheckForTests } =
      await import("./runtime-provider-orchestrator");
    setPostApplyProjectionCheckForTests(() => {
      throw new Error("projection checker failed");
    });
    const result = await bootstrapRuntimeProvider("login");
    expect(result.state.state).toBe("ERROR");
    if (result.state.state === "ERROR") {
      expect(result.state.errorCode).toBe("RUNTIME_PROVIDER_POST_APPLY_DRIFT");
    }
  });

  it("unbinds on logout when nodeskclaw has no auxiliary sidecar", async () => {
    writeFileSync(
      join(testHome, "config.yaml"),
      "model:\n  provider: nodeskclaw\n  default: enterprise-a\n",
    );
    const { clearRuntimeProvider, getRuntimeProviderPublicState } = await import(
      "./runtime-provider-orchestrator"
    );
    const { getModelConfig } = await import("../config");
    await clearRuntimeProvider("logout");
    expect(getRuntimeProviderPublicState()).toEqual({ state: "UNBOUND" });
    expect(getModelConfig().provider).toBe("nodeskclaw");
  });

  it("re-captures after in-place apply, logout, and login again", async () => {
    const { existsSync } = await import("fs");
    writeFileSync(
      join(testHome, "config.yaml"),
      [
        "model:",
        "  provider: nodeskclaw",
        "  default: enterprise-a",
        "providers:",
        "  nodeskclaw:",
        "    name: SMC Enterprise Model",
        "    base_url: https://models.example.test/v1",
        "    key_env: NODESKCLAW_RUNTIME_MODEL_API_KEY",
        "    api_mode: chat_completions",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(testHome, "providers.json"),
      JSON.stringify({
        version: 2,
        providers: [
          {
            id: "nodeskclaw",
            name: "SMC Enterprise Model",
            baseUrl: "https://models.example.test/v1",
            createdAt: 1,
            providerKey: "nodeskclaw",
            keyEnv: "NODESKCLAW_RUNTIME_MODEL_API_KEY",
            apiMode: "chat_completions",
          },
        ],
      }),
    );
    writeFileSync(
      join(testHome, "models.json"),
      JSON.stringify([
        {
          id: "enterprise-a",
          name: "Enterprise A",
          provider: "nodeskclaw",
          model: "enterprise-a",
          baseUrl: "https://models.example.test/v1",
          providerRef: "named:nodeskclaw",
          createdAt: 1,
        },
        {
          id: "enterprise-b",
          name: "Enterprise B",
          provider: "nodeskclaw",
          model: "enterprise-b",
          baseUrl: "https://models.example.test/v1",
          providerRef: "named:nodeskclaw",
          createdAt: 1,
        },
      ]),
    );
    fetchMock.mockResolvedValue(ready("rev-relogin"));
    const {
      bootstrapRuntimeProvider,
      clearRuntimeProvider,
      getRuntimeProviderPublicState,
    } = await import("./runtime-provider-orchestrator");
    const { getModelConfig } = await import("../config");
    const first = await bootstrapRuntimeProvider("login");
    expect(first.state.state).toBe("ACTIVE");
    await clearRuntimeProvider("logout");
    expect(getRuntimeProviderPublicState()).toEqual({ state: "UNBOUND" });
    expect(getModelConfig().provider).toBe("nodeskclaw");
    expect(
      existsSync(join(testHome, "runtime-provider-auxiliary-adoption.json")),
    ).toBe(false);
    const second = await bootstrapRuntimeProvider("login");
    expect(second.state.state).toBe("ACTIVE");
    expect(
      existsSync(join(testHome, "runtime-provider-auxiliary-adoption.json")),
    ).toBe(true);
  });

  it("in-place captures when yaml is already nodeskclaw and sidecar is missing", async () => {
    const { existsSync } = await import("fs");
    writeFileSync(
      join(testHome, "config.yaml"),
      [
        "model:",
        "  provider: nodeskclaw",
        "  default: enterprise-a",
        "providers:",
        "  nodeskclaw:",
        "    name: SMC Enterprise Model",
        "    base_url: https://models.example.test/v1",
        "    key_env: NODESKCLAW_RUNTIME_MODEL_API_KEY",
        "    api_mode: chat_completions",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(testHome, "providers.json"),
      JSON.stringify({
        version: 2,
        providers: [
          {
            id: "nodeskclaw",
            name: "SMC Enterprise Model",
            baseUrl: "https://models.example.test/v1",
            createdAt: 1,
            providerKey: "nodeskclaw",
            keyEnv: "NODESKCLAW_RUNTIME_MODEL_API_KEY",
            apiMode: "chat_completions",
          },
        ],
      }),
    );
    writeFileSync(
      join(testHome, "models.json"),
      JSON.stringify([
        {
          id: "enterprise-a",
          name: "Enterprise A",
          provider: "nodeskclaw",
          model: "enterprise-a",
          baseUrl: "https://models.example.test/v1",
          providerRef: "named:nodeskclaw",
          createdAt: 1,
        },
        {
          id: "enterprise-b",
          name: "Enterprise B",
          provider: "nodeskclaw",
          model: "enterprise-b",
          baseUrl: "https://models.example.test/v1",
          providerRef: "named:nodeskclaw",
          createdAt: 1,
        },
      ]),
    );
    const logs: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((line) => {
      logs.push(String(line));
    });
    fetchMock.mockResolvedValue(ready("rev-inplace"));
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const result = await bootstrapRuntimeProvider("login");
    spy.mockRestore();
    expect(result.state.state).toBe("ACTIVE");
    const config = readFileSync(join(testHome, "config.yaml"), "utf-8");
    expect(config).toContain("nodeskclaw");
    expect(config).not.toMatch(/provider:\s*["']?localhost/);
    expect(
      existsSync(join(testHome, "runtime-provider-auxiliary-adoption.json")),
    ).toBe(true);
    expect(existsSync(join(testHome, "runtime-provider-adoption.json"))).toBe(
      false,
    );
    expect(logs.some((line) => line.includes("adoption_captured_in_place"))).toBe(
      true,
    );
  });

  it("maps writeAuxiliaryAdoption throw to RUNTIME_PROVIDER_PROJECT_FAILED", async () => {
    fetchMock.mockResolvedValue(ready("rev-sidecar-boom"));
    vi.doMock("./runtime-provider-auxiliary-adoption", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("./runtime-provider-auxiliary-adoption")>();
      return {
        ...actual,
        writeAuxiliaryAdoption: () => {
          throw new Error("sidecar write boom");
        },
      };
    });
    vi.resetModules();
    const before = readFileSync(join(testHome, "config.yaml"), "utf-8");
    const { bootstrapRuntimeProvider, getRuntimeProviderPublicState } =
      await import("./runtime-provider-orchestrator");
    const result = await bootstrapRuntimeProvider("login");
    expect(result.state).toEqual({
      state: "ERROR",
      errorCode: "RUNTIME_PROVIDER_PROJECT_FAILED",
    });
    expect(getRuntimeProviderPublicState()).toEqual({
      state: "ERROR",
      errorCode: "RUNTIME_PROVIDER_PROJECT_FAILED",
    });
    expect(readFileSync(join(testHome, "config.yaml"), "utf-8")).toBe(before);
    vi.doUnmock("./runtime-provider-auxiliary-adoption");
  });

  it("keeps auxiliary sidecar when projectManagedRuntime throws after capture", async () => {
    const { existsSync } = await import("fs");
    fetchMock.mockResolvedValue(ready("rev-project-after-capture"));
    vi.doMock("./runtime-provider-projection", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("./runtime-provider-projection")>();
      return {
        ...actual,
        projectManagedRuntime: () => {
          throw new Error("project after capture");
        },
      };
    });
    vi.resetModules();
    const { bootstrapRuntimeProvider } = await import(
      "./runtime-provider-orchestrator"
    );
    const { inspectAuxiliaryAdoption } = await import(
      "./runtime-provider-auxiliary-adoption"
    );
    const result = await bootstrapRuntimeProvider("login");
    expect(result.state).toMatchObject({
      state: "ERROR",
      errorCode: "RUNTIME_PROVIDER_PROJECT_FAILED",
    });
    expect(
      existsSync(join(testHome, "runtime-provider-auxiliary-adoption.json")),
    ).toBe(true);
    expect(inspectAuxiliaryAdoption()).toEqual({ action: "reuse" });
    vi.doUnmock("./runtime-provider-projection");
  });

  it("captures auxiliary routing once, removes slot keys, and restores only the route", async () => {
    const { existsSync } = await import("fs");
    writeFileSync(
      join(testHome, "config.yaml"),
      [
        "model:",
        "  provider: openai",
        "  default: gpt",
        "auxiliary:",
        "  vision:",
        "    provider: custom",
        "    model: fast",
        "    base_url: https://local.test/v1",
        "    api_key: slot-secret",
        "    timeout: 9",
        "",
      ].join("\n"),
    );
    fetchMock.mockResolvedValue(ready("rev-aux"));
    const {
      bootstrapRuntimeProvider,
      clearRuntimeProvider,
      getLastProjectionCheck,
      getRuntimeProviderPublicState,
    } = await import("./runtime-provider-orchestrator");
    const applied = await bootstrapRuntimeProvider("login");
    expect(getLastProjectionCheck().status).toBe("MATCH");
    expect(applied.state.state).toBe("ACTIVE");
    const managed = readFileSync(join(testHome, "config.yaml"), "utf-8");
    expect(managed).not.toContain("slot-secret");
    expect(managed).toContain("timeout: 9");
    const sidecarPath = join(testHome, "runtime-provider-auxiliary-adoption.json");
    const sidecar = readFileSync(sidecarPath, "utf-8");
    expect(sidecar).not.toContain("slot-secret");
    expect(sidecar).toContain("custom");
    await clearRuntimeProvider("logout");
    expect(getRuntimeProviderPublicState().state).toBe("UNBOUND");
    const restored = readFileSync(join(testHome, "config.yaml"), "utf-8");
    expect(restored).toContain("custom");
    expect(restored).not.toContain("slot-secret");
    expect(existsSync(sidecarPath)).toBe(false);
  });
});
