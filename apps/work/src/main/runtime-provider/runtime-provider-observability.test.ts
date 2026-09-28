import { describe, expect, it, vi } from "vitest";
import {
  logRuntimeProviderOperation,
  logRuntimeProviderReconcile,
} from "./runtime-provider-observability";

describe("runtime provider observability", () => {
  it("keeps generation order and drops secret-derived fields", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((line) => {
      lines.push(String(line));
    });
    logRuntimeProviderOperation({
      operation_id: "op-1",
      generation: 1,
      reason: "login",
      profile: "default",
      stage: "INTENT",
      status: "START",
      api_key: "member-key",
      prefix: "member",
      length: 10,
      fingerprint: "abc",
    });
    logRuntimeProviderOperation({
      operation_id: "op-1",
      generation: 1,
      reason: "login",
      profile: "default",
      stage: "ROLLBACK",
      status: "FAIL",
      errorCode: "RUNTIME_PROVIDER_ROLLBACK_FAILED",
    });
    logRuntimeProviderOperation({
      operation_id: "op-2",
      generation: 2,
      reason: "logout",
      profile: "default",
      stage: "COMPLETE",
      status: "PASS",
      runtime_state: "UNBOUND",
    });
    spy.mockRestore();
    const text = lines.join("\n");
    expect(text).not.toContain("member-key");
    expect(text).not.toContain("fingerprint");
    expect(text).toContain('"generation":1');
    expect(text).toContain('"generation":2');
    expect(text).toContain('"stage":"ROLLBACK"');
    expect(text.indexOf('"generation":1')).toBeLessThan(
      text.indexOf('"generation":2'),
    );
  });

  it("keeps reconcile busy and backoff apart and drops secret fields", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((line) => {
      lines.push(String(line));
    });
    logRuntimeProviderReconcile({
      trigger: "resume_reconcile",
      scheduler_state: "SCHEDULED",
      result: "SKIPPED_BUSY",
      runtime_state: "APPLYING",
      consecutive_unavailable: 1,
      api_key: "member-key",
      Authorization: "Bearer secret",
      jwt: "header.payload",
      prefix: "mem",
      length: 8,
      fingerprint: "abc",
    });
    logRuntimeProviderReconcile({
      trigger: "scheduled_reconcile",
      scheduler_state: "BACKOFF",
      result: "ERROR",
      error_code: "RUNTIME_BOOTSTRAP_UNAVAILABLE",
      next_due_delay_ms: 60000,
      consecutive_unavailable: 1,
    });
    spy.mockRestore();
    const text = lines.join("\n");
    expect(text).toContain('"event":"runtime_provider_reconcile"');
    expect(text).toContain('"result":"SKIPPED_BUSY"');
    expect(text).toContain('"scheduler_state":"BACKOFF"');
    expect(text).not.toContain("member-key");
    expect(text).not.toContain("Bearer");
    expect(text).not.toContain("header.payload");
    expect(text).not.toContain("fingerprint");
    expect(text).not.toContain('"prefix"');
    expect(text).not.toContain('"length"');
    expect(text).not.toContain('"jwt"');
  });
});
