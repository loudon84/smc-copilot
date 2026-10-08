import { describe, expect, it } from "vitest";
import {
  idleReconcileDiagnostics,
  projectDiagnosticEvent,
  recoveryActions,
  redactHomePath,
  runtimeProviderSettingsLocked,
  enterpriseRuntimeHidesDiagnostics,
  sanitizeDiagnosticUrl,
  summaryStatus,
} from "./runtime-provider-diagnostics";

describe("runtime provider diagnostics schema", () => {
  it("drops an invalid URL and redacts the current home prefix", () => {
    expect(sanitizeDiagnosticUrl("not a url")).toBeNull();
    expect(
      sanitizeDiagnosticUrl("https://user:secret@models.example.test/v1?token=abc#x"),
    ).toBe("https://models.example.test/v1");
    expect(
      redactHomePath("C:\\Users\\Administrator\\.hermes", "C:\\Users\\Administrator"),
    ).toBe("<USER_HOME>\\.hermes");
    expect(JSON.stringify(redactHomePath(
      "C:\\Users\\Administrator\\.hermes",
      "C:\\Users\\Administrator",
    ))).not.toContain("Administrator");
  });

  it("keeps an inactive profile reconcile block idle", () => {
    expect(idleReconcileDiagnostics().nextDueAt).toBeNull();
    expect(idleReconcileDiagnostics().consecutiveUnavailable).toBe(0);
    expect(JSON.stringify(idleReconcileDiagnostics())).not.toContain("api_key");
  });

  it("maps summary and recovery from the runtime state", () => {
    expect(summaryStatus({ runtimeState: "STALE_ACTIVE", gatewayHealthy: false })).toBe(
      "DEGRADED",
    );
    expect(summaryStatus({ runtimeState: "ACTIVE", gatewayHealthy: false })).toBe(
      "ACTION_REQUIRED",
    );
    expect(
      recoveryActions({
        runtimeState: "ACTIVE",
        errorCode: null,
        gatewayHealthy: false,
      }),
    ).toEqual(["reconcile", "export", "openGateway"]);
    expect(
      recoveryActions({
        runtimeState: "ERROR",
        errorCode: "RUNTIME_BOOTSTRAP_UNAUTHORIZED",
        gatewayHealthy: true,
      }),
    ).toEqual(["export"]);
    expect(
      recoveryActions({
        runtimeState: "ERROR",
        errorCode: "RUNTIME_PROVIDER_POST_APPLY_DRIFT",
        gatewayHealthy: null,
      }),
    ).toEqual(["export", "retry"]);
    expect(
      recoveryActions({
        runtimeState: "FETCHING",
        errorCode: null,
        gatewayHealthy: false,
      }),
    ).toEqual(["export", "retry"]);
    expect(
      recoveryActions({
        runtimeState: "APPLYING",
        errorCode: null,
        gatewayHealthy: true,
      }),
    ).toEqual(["export", "retry"]);
    expect(
      recoveryActions({
        runtimeState: "ERROR",
        errorCode: "RUNTIME_PROVIDER_PROJECT_FAILED",
        gatewayHealthy: null,
      }),
    ).toEqual(["export", "retry"]);
    expect(
      enterpriseRuntimeHidesDiagnostics({
        summaryStatus: "READY",
        runtimeState: "ACTIVE",
        projectionStatus: "MATCH",
        gatewayHealthy: true,
      }),
    ).toBe(true);
    expect(
      enterpriseRuntimeHidesDiagnostics({
        summaryStatus: "ACTION_REQUIRED",
        runtimeState: "ACTIVE",
        projectionStatus: "MATCH",
        gatewayHealthy: false,
      }),
    ).toBe(false);
    expect(
      runtimeProviderSettingsLocked({
        mode: "local",
        runtimeState: "ACTIVE",
      }),
    ).toBe(true);
    expect(
      runtimeProviderSettingsLocked({
        mode: "local",
        runtimeState: "UNBOUND",
      }),
    ).toBe(false);
    expect(
      runtimeProviderSettingsLocked({
        mode: "remote",
        runtimeState: "ACTIVE",
      }),
    ).toBe(false);
  });

  it("projects events through the allowlist", () => {
    const projected = projectDiagnosticEvent({
      stage: "FETCH",
      innocentField: "sk-secret-sentinel",
      api_key: "sk-secret-sentinel",
      runtime_state: "ACTIVE",
    });
    expect(projected).toEqual({ stage: "FETCH", runtimeState: "ACTIVE" });
    expect(JSON.stringify(projected)).not.toContain("sk-secret-sentinel");
  });
});
