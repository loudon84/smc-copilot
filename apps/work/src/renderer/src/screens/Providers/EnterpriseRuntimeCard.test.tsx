import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EnterpriseRuntimeCard from "./EnterpriseRuntimeCard";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    snapshot: {
      schemaVersion: "1.0",
      generatedAt: "2026-09-28T00:00:00.000Z",
      profile: "default",
      summaryStatus: "ACTION_REQUIRED",
      connection: { mode: "local", authenticatedSessionPresent: true },
      runtimeProvider: {
        state: "ACTIVE",
        backendState: null,
        errorCode: null,
        revision: "rev",
        providerRef: "named:nodeskclaw",
        defaultModel: "enterprise-a",
        modelIds: ["enterprise-a"],
        modelCount: 1,
        managedSecretPresent: true,
      },
      reconcile: {
        schedulerState: "SCHEDULED",
        lastTrigger: "login",
        lastResult: "RECONCILED",
        lastAttemptAt: null,
        lastSuccessfulFetchAt: null,
        nextDueAt: null,
        consecutiveUnavailable: 0,
      },
      projection: { status: "MATCH", checkedAt: null, revision: "rev", reasons: [] },
      gateway: {
        observed: true,
        state: "ready",
        gatewayHealthy: false,
        authenticated: true,
        errorCode: null,
        endpoint: "http://127.0.0.1:8642/",
        homePath: "<USER_HOME>/.hermes",
        executablePath: null,
      },
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("enterprise runtime card", () => {
  it("keeps reconcile and export when the gateway is unhealthy", async () => {
    const refresh = vi.fn();
    const getDiagnostics = vi.fn(async () => snapshot());
    (window as unknown as { hermesAPI: unknown }).hermesAPI = {
      getRuntimeProviderDiagnostics: getDiagnostics,
      exportRuntimeProviderDiagnostics: vi.fn(),
      refreshRuntimeProvider: refresh,
      onRuntimeProviderStateChanged: () => () => undefined,
    };
    render(<EnterpriseRuntimeCard visible />);
    expect(await screen.findByText("providers.enterpriseRuntime.reconcile")).toBeTruthy();
    expect(screen.getByText("providers.enterpriseRuntime.export")).toBeTruthy();
    expect(screen.getByText("providers.enterpriseRuntime.openGateway")).toBeTruthy();
    expect(screen.queryByText("Delete provider")).toBeNull();
  });

  it("hides the diagnostic log while enterprise runtime is healthy", async () => {
    const getDiagnostics = vi.fn(async () =>
      snapshot({
        summaryStatus: "READY",
        gateway: {
          observed: true,
          state: "ready",
          gatewayHealthy: true,
          authenticated: true,
          errorCode: null,
          endpoint: "http://127.0.0.1:8642/",
          homePath: "<USER_HOME>/.hermes",
          executablePath: null,
        },
      }),
    );
    (window as unknown as { hermesAPI: unknown }).hermesAPI = {
      getRuntimeProviderDiagnostics: getDiagnostics,
      exportRuntimeProviderDiagnostics: vi.fn(),
      refreshRuntimeProvider: vi.fn(),
      onRuntimeProviderStateChanged: () => () => undefined,
    };
    render(<EnterpriseRuntimeCard visible />);
    expect(await screen.findByText("providers.enterpriseRuntime.managed")).toBeTruthy();
    expect(screen.getByText("providers.enterpriseRuntime.secretLoaded")).toBeTruthy();
    expect(screen.queryByText("Summary")).toBeNull();
    expect(screen.queryByText("providers.enterpriseRuntime.reconcile")).toBeNull();
    expect(screen.queryByText("providers.enterpriseRuntime.export")).toBeNull();
  });

  it("does not poll diagnostics while the snapshot stays unchanged", async () => {
    vi.useFakeTimers();
    const getDiagnostics = vi.fn(async () =>
      snapshot({
        summaryStatus: "ACTION_REQUIRED",
        runtimeProvider: {
          state: "ERROR",
          backendState: null,
          errorCode: "MANAGED_PROVIDER_IDENTITY_CONFLICT",
          revision: null,
          providerRef: null,
          defaultModel: null,
          modelIds: [],
          modelCount: 0,
          managedSecretPresent: false,
        },
      }),
    );
    (window as unknown as { hermesAPI: unknown }).hermesAPI = {
      getRuntimeProviderDiagnostics: getDiagnostics,
      exportRuntimeProviderDiagnostics: vi.fn(),
      refreshRuntimeProvider: vi.fn(),
      onRuntimeProviderStateChanged: () => () => undefined,
    };
    render(<EnterpriseRuntimeCard visible />);
    await vi.waitFor(() => expect(getDiagnostics).toHaveBeenCalledTimes(1));
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(getDiagnostics).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("providers.enterpriseRuntime.retry")).toBeNull();
  });
});
