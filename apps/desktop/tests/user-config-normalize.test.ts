import { describe, it, expect } from "vitest";
import { normalizeBootstrapConfig } from "../src/shared/user-config/user-config-normalize";

describe("normalizeBootstrapConfig", () => {
  it("migrates v1 frontendUrl to aiosHomeUrl", () => {
    const normalized = normalizeBootstrapConfig({
      schemaVersion: 1,
      configVersion: "v1",
      configHash: "h1",
      user: {
        userId: "u1",
        username: "a",
        displayName: "A",
        tenantId: "t1",
      },
      features: {
        aiosHome: true,
        aiosWorkspace: true,
        webOperator: true,
        office: true,
        hermesRuntimeDrawer: true,
      },
      hermes: {
        activeProfile: "default",
        connection: { mode: "local" },
        profiles: [],
        models: [],
      },
      aios: {
        frontendUrl: "http://127.0.0.1:3000",
        backendUrl: "http://127.0.0.1:8000",
        autoStart: false,
      },
    });

    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.aios.aiosHomeUrl).toBe("http://127.0.0.1:3000");
    expect(normalized.aios.authPrefix).toBe("/api/auth");
    expect(normalized.aios.frontendUrl).toBe("http://127.0.0.1:3000");
  });
});
