import { describe, expect, it, vi } from "vitest";
import { logRuntimeProviderOperation } from "./runtime-provider-observability";

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
});
