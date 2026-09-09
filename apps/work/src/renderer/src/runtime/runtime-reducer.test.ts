import { describe, expect, it } from "vitest";
import type { HermesRuntimeProbe } from "../../../shared/runtime/runtime-contract";
import {
  initialRuntimeState,
  runtimeReducer,
} from "./runtime-reducer";

function probe(
  overrides: Partial<HermesRuntimeProbe> = {},
): HermesRuntimeProbe {
  return {
    mode: "local",
    state: "ready",
    endpoint: "http://127.0.0.1:8642",
    runtimeFound: true,
    cliAvailable: true,
    gatewayRunning: true,
    gatewayHealthy: true,
    authenticated: true,
    ...overrides,
  };
}

describe("runtimeReducer", () => {
  it("starts as not ready and not connecting, without a starting-gateway state", () => {
    expect(initialRuntimeState.connecting).toBe(false);
    expect(initialRuntimeState.ready).toBe(false);
    expect(initialRuntimeState.state).not.toBe("ready");
    expect(String(initialRuntimeState.state)).not.toContain("starting");
  });

  it("CONNECT_START only sets connecting and keeps the last probe state", () => {
    const previous = runtimeReducer(initialRuntimeState, {
      type: "CONNECT_FAILURE",
      status: probe({ state: "gateway_unreachable" }),
      error: "down",
    });
    const next = runtimeReducer(previous, { type: "CONNECT_START" });
    expect(next.connecting).toBe(true);
    expect(next.ready).toBe(false);
    expect(next.state).toBe("gateway_unreachable");
    expect(next.error).toBe(null);
    expect(String(next.state)).not.toContain("starting");
  });

  it("CONNECT_SUCCESS marks ready after a successful probe", () => {
    const connecting = runtimeReducer(initialRuntimeState, {
      type: "CONNECT_START",
    });
    const next = runtimeReducer(connecting, {
      type: "CONNECT_SUCCESS",
      status: probe(),
    });
    expect(next.connecting).toBe(false);
    expect(next.ready).toBe(true);
    expect(next.state).toBe("ready");
  });
});
