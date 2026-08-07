import { describe, it, expect } from "vitest";
import { diffBootstrapConfig } from "../src/main/user-config/user-config-diff";
import type { DesktopBootstrapConfig } from "../src/shared/user-config/user-config-contract";

function baseConfig(hash: string): DesktopBootstrapConfig {
  return {
    schemaVersion: 1,
    configVersion: "v1",
    configHash: hash,
    user: {
      userId: "u1",
      username: "alice",
      displayName: "Alice",
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
      profiles: [{ name: "default", enabled: true }],
      models: [],
    },
    aios: {
      frontendUrl: "http://127.0.0.1:3000",
      backendUrl: "http://127.0.0.1:8000",
      autoStart: true,
    },
  };
}

describe("diffBootstrapConfig", () => {
  it("returns empty diff when configs match", () => {
    const config = baseConfig("hash-a");
    expect(diffBootstrapConfig(config, { ...config })).toEqual([]);
  });

  it("detects changed fields", () => {
    const local = baseConfig("hash-a");
    const remote = baseConfig("hash-b");
    remote.hermes.activeProfile = "writer";
    const diff = diffBootstrapConfig(local, remote);
    expect(diff.some((d) => d.path.includes("activeProfile") && d.type === "changed")).toBe(
      true,
    );
  });

  it("masks sensitive paths", () => {
    const local = baseConfig("a");
    const remote = baseConfig("b");
    remote.hermes.connection = {
      mode: "remote",
      remoteUrl: "https://example.com",
      apiKeyRef: "secret-ref",
    };
    const diff = diffBootstrapConfig(local, remote);
    const apiKeyDiff = diff.find((d) => d.path.toLowerCase().includes("apikey"));
    expect(apiKeyDiff?.sensitive).toBe(true);
    if (apiKeyDiff?.remoteValue !== undefined) {
      expect(String(apiKeyDiff.remoteValue)).not.toContain("secret-ref");
    }
  });
});
