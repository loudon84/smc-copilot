import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testHome: string;

beforeEach(() => {
  vi.resetModules();
  testHome = mkdtempSync(join(tmpdir(), "runtime-auxiliary-"));
  vi.stubEnv("HERMES_HOME", testHome);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(testHome, { recursive: true, force: true });
});

describe("auxiliary adoption sidecar", () => {
  it("records a missing field as absent and an empty string as present", async () => {
    writeFileSync(join(testHome, "config.yaml"), "auxiliary:\n  vision:\n    provider: custom\n    model: \"\"\n");
    const { captureAuxiliaryAdoptionFromConfig } = await import(
      "./runtime-provider-auxiliary-adoption"
    );
    const captured = captureAuxiliaryAdoptionFromConfig(
      readFileSync(join(testHome, "config.yaml"), "utf-8"),
    );
    expect(captured.slots.vision.base_url).toEqual({ present: false, value: null });
    expect(captured.slots.vision.model).toEqual({ present: true, value: "" });
  });

  it("does not rewrite a valid sidecar", async () => {
    writeFileSync(join(testHome, "config.yaml"), "model:\n  provider: openai\n");
    const { writeAuxiliaryAdoption, auxiliaryAdoptionPath, inspectAuxiliaryAdoption } =
      await import("./runtime-provider-auxiliary-adoption");
    writeAuxiliaryAdoption(undefined, "model:\n  provider: openai\n");
    const first = readFileSync(auxiliaryAdoptionPath(), "utf-8");
    expect(inspectAuxiliaryAdoption()).toEqual({ action: "reuse" });
    expect(readFileSync(auxiliaryAdoptionPath(), "utf-8")).toBe(first);
  });

  it("blocks a nodeskclaw profile that has no sidecar", async () => {
    writeFileSync(join(testHome, "config.yaml"), "model:\n  provider: nodeskclaw\n");
    const { inspectAuxiliaryAdoption, auxiliaryAdoptionPath } = await import(
      "./runtime-provider-auxiliary-adoption"
    );
    const { existsSync } = await import("fs");
    expect(inspectAuxiliaryAdoption()).toEqual({
      action: "block",
      error: "RUNTIME_AUXILIARY_ADOPTION_MISSING",
    });
    expect(existsSync(auxiliaryAdoptionPath())).toBe(false);
  });

  it("treats a reappearing slot key as routing drift", async () => {
    const { auxiliaryRouteDrift } = await import("./runtime-provider-auxiliary-adoption");
    const { AUX_TASK_SLOTS } = await import("../auxiliary-config");
    const contained = [
      "auxiliary:",
      ...AUX_TASK_SLOTS.flatMap((task) => [
        `  ${task}:`,
        '    provider: "auto"',
        '    model: ""',
        '    base_url: ""',
      ]),
    ].join("\n");
    expect(auxiliaryRouteDrift(contained)).toBe(false);
    expect(auxiliaryRouteDrift(`${contained}\n    api_key: ""\n`)).toBe(true);
  });
});
