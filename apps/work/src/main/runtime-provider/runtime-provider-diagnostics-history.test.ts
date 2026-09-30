import { afterEach, describe, expect, it } from "vitest";
import { logRuntimeProviderOperation } from "./runtime-provider-observability";
import {
  appendDiagnosticEvent,
  clearDiagnosticHistoryForTests,
  readDiagnosticHistory,
  setDiagnosticRecorderForTests,
} from "./runtime-provider-diagnostics-history";

afterEach(() => {
  setDiagnosticRecorderForTests(null);
  clearDiagnosticHistoryForTests();
});

describe("runtime provider diagnostics history", () => {
  it("keeps the newest 200 events", () => {
    for (let index = 0; index < 250; index += 1) {
      appendDiagnosticEvent({ stage: "FETCH", generation: index });
    }
    const history = readDiagnosticHistory();
    expect(history).toHaveLength(200);
    expect(history[0]?.generation).toBe(50);
  });

  it("drops unknown and secret fields", () => {
    appendDiagnosticEvent({
      stage: "FETCH",
      innocentField: "sk-secret-sentinel",
      api_key: "sk-secret-sentinel",
    });
    const text = JSON.stringify(readDiagnosticHistory());
    expect(text).not.toContain("innocentField");
    expect(text).not.toContain("sk-secret-sentinel");
  });

  it("keeps runtime logging alive when the recorder throws", () => {
    setDiagnosticRecorderForTests(() => {
      throw new Error("recorder down");
    });
    expect(() =>
      logRuntimeProviderOperation({
        stage: "COMPLETE",
        status: "PASS",
        runtime_state: "ACTIVE",
      }),
    ).not.toThrow();
  });
});
