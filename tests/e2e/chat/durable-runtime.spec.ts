/**
 * Chat durable runtime Electron E2E specs (v8.1.1).
 * Full window flows require a built app; structural checks always run.
 */

import { test, expect } from "@playwright/test";
import { existsSync } from "fs";
import { join } from "path";
import { createMockHermesGateway } from "../fixtures/mockHermesGateway";
import { createMockCapabilityServer } from "../fixtures/mockCapabilityServer";
import { createRuntimeRecorder } from "../fixtures/runtimeRecorder";
import {
  closeElectronApp,
  launchElectronApp,
} from "../fixtures/electronApp";

const hasBuiltApp =
  Boolean(process.env.ELECTRON_APP_PATH) ||
  existsSync(join(process.cwd(), "out", "main", "index.js"));

test.describe("chat durable runtime e2e (v8.1.1)", () => {
  test("native clarify capability profile is exclusive", () => {
    const caps = createMockCapabilityServer("native");
    expect(caps?.clarify_response).toBe(true);
    const gw = createMockHermesGateway(caps || undefined);
    expect(gw.capabilities.clarify_response).toBe(true);
    expect(gw.capabilities.session_continuation).toBe(true);
  });

  test("fallback clarify capability profile", () => {
    const caps = createMockCapabilityServer("fallback");
    expect(caps?.clarify_response).toBe(false);
    expect(caps?.session_continuation).toBe(true);
  });

  test("unknown capability should not invent continuation", () => {
    const caps = createMockCapabilityServer("unknown");
    expect(caps).toBeNull();
  });

  test("runtime recorder captures approval/recovery/queue markers", () => {
    const rec = createRuntimeRecorder();
    rec.record("approval");
    rec.record("recovery");
    rec.record("durable-sequence", { sequence: 4 });
    rec.record("multi-profile", { profiles: ["default", "coding"] });
    rec.record("queue");
    rec.record("retry");
    rec.record("diagnostics");
    rec.record("screenshot");
    expect(rec.entries.map((e) => e.kind)).toEqual([
      "approval",
      "recovery",
      "durable-sequence",
      "multi-profile",
      "queue",
      "retry",
      "diagnostics",
      "screenshot",
    ]);
  });

  test("electron window smoke", async () => {
    test.skip(
      !hasBuiltApp || process.env.E2E_ELECTRON_WINDOW !== "1",
      "Set E2E_ELECTRON_WINDOW=1 after a runnable Electron build with UI",
    );
    const harness = await launchElectronApp();
    try {
      await expect(harness.page).toHaveTitle(/SMC|Copilot|Hermes|Desktop/i);
      await harness.page.screenshot({
        path: "test-results/e2e-electron/chat-smoke.png",
      });
    } finally {
      await closeElectronApp(harness);
    }
  });
});
