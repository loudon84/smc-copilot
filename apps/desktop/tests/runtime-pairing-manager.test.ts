/**
 * PRD v1.3.2 — pairAndConnect transaction + token lifecycle tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/copilot-runtime-pairing-test",
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

const runtimeFetch = vi.fn();
vi.mock("../src/main/copilot-runtime-client/runtime-http-client", async () => {
  const actual = await vi.importActual<
    typeof import("../src/main/copilot-runtime-client/runtime-http-client")
  >("../src/main/copilot-runtime-client/runtime-http-client");
  return {
    ...actual,
    runtimeFetch: (...args: unknown[]) => runtimeFetch(...args),
  };
});

const getRuntimeConnectionState = vi.fn();
const runRuntimeHandshake = vi.fn();
vi.mock("../src/main/copilot-runtime-client/runtime-connection-manager", () => ({
  getRuntimeConnectionState: () => getRuntimeConnectionState(),
  runRuntimeHandshake: () => runRuntimeHandshake(),
}));

import { createInitialRuntimeConnectionState } from "../src/shared/copilot-runtime/runtime-state-contract";
import {
  clearDeviceToken,
  getDeviceTokenSync,
  getPublicAuthSnapshot,
  hydrateRuntimeAuthStore,
  isPairedSync,
} from "../src/main/copilot-runtime-client/runtime-auth-store";
import {
  clearPendingPairingChallenge,
  confirmPairing,
  getPendingPairingChallenge,
  pairAndConnect,
  startPairing,
} from "../src/main/copilot-runtime-client/runtime-pairing-manager";
import { CopilotRuntimeHttpError } from "../src/main/copilot-runtime-client/runtime-http-client";
import { createDesktopRuntimeError } from "../src/main/copilot-runtime-client/runtime-error-mapper";

function pairingRequiredState() {
  return createInitialRuntimeConnectionState({
    state: "PairingRequired",
    canPair: true,
    lastErrorCode: "PAIRING_REQUIRED",
  });
}

function readyState(deviceId = "dev-1") {
  return createInitialRuntimeConnectionState({
    state: "Ready",
    ready: true,
    paired: true,
    deviceId,
  });
}

describe("runtime-pairing-manager (PRD v1.3.2)", () => {
  beforeEach(async () => {
    runtimeFetch.mockReset();
    getRuntimeConnectionState.mockReset();
    runRuntimeHandshake.mockReset();
    clearPendingPairingChallenge();
    await clearDeviceToken();
  });

  it("startPairing does not expose challenge to Renderer payload", async () => {
    runtimeFetch.mockResolvedValueOnce({
      pairingId: "p1",
      challenge: "secret-challenge",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    const result = await startPairing();
    expect(result.pairingId).toBe("p1");
    expect(result.code).toBeNull();
    expect(getPendingPairingChallenge()).toBe("secret-challenge");
  });

  it("pairAndConnect succeeds: start → confirm → save → handshake Ready", async () => {
    getRuntimeConnectionState.mockReturnValue(pairingRequiredState());
    runtimeFetch
      .mockResolvedValueOnce({
        pairingId: "p-ok",
        challenge: "ch",
        expiresAt: "2099-01-01T00:00:00Z",
      })
      .mockResolvedValueOnce({
        deviceId: "device-ok",
        deviceToken: "token-ok",
        name: "Desktop",
      });
    runRuntimeHandshake.mockResolvedValue(readyState("device-ok"));

    const result = await pairAndConnect();
    expect(result.ok).toBe(true);
    expect(result.state.state).toBe("Ready");
    expect(result.deviceId).toBe("device-ok");
    expect(getDeviceTokenSync()).toBe("token-ok");
    expect(isPairedSync()).toBe(true);
    expect(getPendingPairingChallenge()).toBeNull();
    expect(["secure", "memory-only"]).toContain(result.persistence);
  });

  it("pairAndConnect rejects when state is not PairingRequired/Ready", async () => {
    getRuntimeConnectionState.mockReturnValue(
      createInitialRuntimeConnectionState({ state: "RuntimeMissing" }),
    );
    const result = await pairAndConnect();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PAIRING_NOT_ALLOWED");
    expect(runtimeFetch).not.toHaveBeenCalled();
  });

  it("pairAndConnect returns Ready immediately when already Ready", async () => {
    getRuntimeConnectionState.mockReturnValue(readyState("already"));
    const result = await pairAndConnect();
    expect(result.ok).toBe(true);
    expect(result.deviceId).toBe("already");
    expect(runtimeFetch).not.toHaveBeenCalled();
  });

  it("start failure keeps PairingRequired and does not persist token", async () => {
    getRuntimeConnectionState.mockReturnValue(pairingRequiredState());
    runtimeFetch.mockRejectedValueOnce(
      new CopilotRuntimeHttpError(
        createDesktopRuntimeError("RUNTIME_UNAVAILABLE", "start failed"),
        503,
      ),
    );
    const result = await pairAndConnect();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PAIRING_START_FAILED");
    expect(getDeviceTokenSync()).toBeNull();
  });

  it("confirm failure does not persist token", async () => {
    getRuntimeConnectionState.mockReturnValue(pairingRequiredState());
    runtimeFetch
      .mockResolvedValueOnce({
        pairingId: "p-fail",
        challenge: "ch",
        expiresAt: "2099-01-01T00:00:00Z",
      })
      .mockRejectedValueOnce(
        new CopilotRuntimeHttpError(
          createDesktopRuntimeError("UNKNOWN", "confirm failed"),
          400,
        ),
      );
    const result = await pairAndConnect();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PAIRING_CONFIRM_FAILED");
    expect(getDeviceTokenSync()).toBeNull();
  });

  it("expired challenge clears pending and returns PAIRING_EXPIRED", async () => {
    getRuntimeConnectionState.mockReturnValue(pairingRequiredState());
    runtimeFetch
      .mockResolvedValueOnce({
        pairingId: "p-exp",
        challenge: "ch",
        expiresAt: "2000-01-01T00:00:00Z",
      })
      .mockRejectedValueOnce(
        new CopilotRuntimeHttpError(
          createDesktopRuntimeError("PAIRING_EXPIRED", "pairing expired"),
          400,
        ),
      );
    const result = await pairAndConnect();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PAIRING_EXPIRED");
    expect(result.error?.retryable).toBe(true);
    expect(getPendingPairingChallenge()).toBeNull();
  });

  it("serializes concurrent pairAndConnect into one pairing", async () => {
    getRuntimeConnectionState.mockReturnValue(pairingRequiredState());
    let confirmCalls = 0;
    runtimeFetch.mockImplementation(async (opts: { path: string }) => {
      if (opts.path.endsWith("/pairings/start")) {
        return {
          pairingId: "p-once",
          challenge: "ch-once",
          expiresAt: "2099-01-01T00:00:00Z",
        };
      }
      confirmCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        deviceId: "device-once",
        deviceToken: "token-once",
        name: "Desktop",
      };
    });
    runRuntimeHandshake.mockResolvedValue(readyState("device-once"));

    const [a, b, c] = await Promise.all([
      pairAndConnect(),
      pairAndConnect(),
      pairAndConnect(),
    ]);
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(confirmCalls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("confirmPairing without start fails", async () => {
    const result = await confirmPairing("missing");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Missing pairing challenge/);
  });
});

describe("runtime-auth hydrate order (PRD v1.3.2)", () => {
  beforeEach(async () => {
    await clearDeviceToken();
  });

  it("hydrateRuntimeAuthStore runs before isPairedSync becomes true from memory", async () => {
    expect(isPairedSync()).toBe(false);
    const meta = await hydrateRuntimeAuthStore();
    expect(meta).toBeNull();
    expect(getPublicAuthSnapshot().paired).toBe(false);
  });
});
