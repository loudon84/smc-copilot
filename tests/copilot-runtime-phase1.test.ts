import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/copilot-runtime-test",
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock("keytar", () => ({
  default: {
    getPassword: vi.fn(async () => null),
    setPassword: vi.fn(async () => undefined),
    deletePassword: vi.fn(async () => true),
  },
}));

import {
  createDesktopRuntimeError,
  mapServeErrorEnvelope,
  mapNetworkError,
} from "../src/main/copilot-runtime-client/runtime-error-mapper";
import {
  assertReadyForWrites,
  setCachedCapabilities,
  toCapabilitiesView,
  hasFeature,
} from "../src/main/copilot-runtime-client/runtime-capability-manager";
import {
  canSpawnCopilotServe,
  isLegacyHermesDirectAllowed,
  resolveCopilotRuntimeMode,
} from "../src/main/copilot-runtime-client/runtime-mode";
import { getPublicAuthSnapshot } from "../src/main/copilot-runtime-client/runtime-auth-store";
import type { CopilotServeConnection } from "../src/shared/copilot-serve/copilot-serve-contract";

describe("runtime-error-mapper", () => {
  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Maps unauthorized to pairing required]]
  it("maps 401 to PAIRING_REQUIRED", () => {
    const err = mapServeErrorEnvelope({ status: 401, body: { detail: "nope" } });
    expect(err.code).toBe("PAIRING_REQUIRED");
    expect(err.retryable).toBe(false);
  });

  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Maps revoked device codes]]
  it("maps Serve code aliases", () => {
    const err = mapServeErrorEnvelope({
      body: { error: { code: "device_revoked", message: "revoked" } },
    });
    expect(err.code).toBe("DEVICE_REVOKED");
    expect(err.message).toBe("revoked");
  });

  it("maps network failures to RUNTIME_UNAVAILABLE", () => {
    const err = mapNetworkError(new Error("fetch failed: ECONNREFUSED"));
    expect(err.code).toBe("RUNTIME_UNAVAILABLE");
    expect(err.retryable).toBe(true);
  });

  it("createDesktopRuntimeError sets retryable defaults", () => {
    expect(createDesktopRuntimeError("STREAM_DISCONNECTED", "x").retryable).toBe(true);
    expect(createDesktopRuntimeError("POLICY_DENIED", "x").retryable).toBe(false);
  });
});

describe("runtime-capability-manager", () => {
  beforeEach(() => {
    setCachedCapabilities(null);
  });

  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Write gate blocks when not Ready]]
  it("tracks features and write gate", () => {
    expect(hasFeature("instances")).toBe(false);
    setCachedCapabilities(
      toCapabilitiesView({ apiVersion: "1.3", features: ["instances", "pairings", "runtime"] }),
    );
    expect(hasFeature("instances")).toBe(true);
    expect(assertReadyForWrites(false)?.code).toBe("RUNTIME_UNAVAILABLE");
    expect(assertReadyForWrites(true)).toBeNull();
  });
});

describe("runtime-mode", () => {
  it("defaults to development", () => {
    expect(resolveCopilotRuntimeMode({})).toBe("development");
  });

  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Production forbids spawn]]
  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Production ignores legacy hermes-direct flag]]
  it("production never allows spawn or legacy hermes direct", () => {
    expect(canSpawnCopilotServe("production")).toBe(false);
    expect(
      isLegacyHermesDirectAllowed(
        { COPILOT_ALLOW_LEGACY_HERMES_DIRECT: "true" },
        "production",
      ),
    ).toBe(false);
  });

  it("development can allow legacy hermes direct", () => {
    expect(
      isLegacyHermesDirectAllowed(
        { COPILOT_ALLOW_LEGACY_HERMES_DIRECT: "true" },
        "development",
      ),
    ).toBe(true);
  });
});

describe("token de-leak contract", () => {
  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Connection shape has no token field]]
  it("CopilotServeConnection type has no token field at runtime object shape", () => {
    const conn: CopilotServeConnection = {
      baseUrl: "http://127.0.0.1:8765",
      port: 8765,
    };
    expect("token" in conn).toBe(false);
  });

  // @lat: [[serve-runtime-tests#Serve-First Runtime tests#Public auth snapshot omits token keys]]
  it("public auth snapshot never includes token", () => {
    const snap = getPublicAuthSnapshot();
    expect(Object.keys(snap).includes("token")).toBe(false);
    expect(Object.keys(snap).includes("deviceToken")).toBe(false);
    expect(typeof snap.paired).toBe("boolean");
  });
});
