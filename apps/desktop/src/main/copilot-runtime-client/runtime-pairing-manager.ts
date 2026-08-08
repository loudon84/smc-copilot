/**
 * Runtime device pairing (PRD v1.3.2).
 * Challenge + deviceToken stay in Main memory / secure store — never IPC to Renderer.
 */
import type {
  RuntimePairAndConnectResult,
  RuntimePairingConfirmResult,
  RuntimePairingStartResult,
} from "../../shared/copilot-runtime";
import {
  getDeviceMetaSync,
  saveDeviceToken,
  type DeviceTokenPersistence,
} from "./runtime-auth-store";
import {
  getRuntimeConnectionState,
  runRuntimeHandshake,
} from "./runtime-connection-manager";
import { CopilotRuntimeHttpError, runtimeFetch } from "./runtime-http-client";

interface PairingStartResponse {
  pairingId: string;
  challenge: string;
  expiresAt: string;
}

interface PairingConfirmResponse {
  deviceId: string;
  deviceToken: string;
  name: string;
}

/** In-memory challenge from last start(); never sent to Renderer. */
let pendingChallenge: { pairingId: string; challenge: string } | null = null;

let pairAndConnectInFlight: Promise<RuntimePairAndConnectResult> | null = null;

export function getPendingPairingChallenge(): string | null {
  return pendingChallenge?.challenge ?? null;
}

export function clearPendingPairingChallenge(): void {
  pendingChallenge = null;
}

export async function startPairing(): Promise<RuntimePairingStartResult> {
  console.log("[copilot-runtime] pairing start");
  try {
    const res = await runtimeFetch<PairingStartResponse>({
      method: "POST",
      path: "/api/v1/pairings/start",
      unauthenticated: true,
      body: {},
    });
    pendingChallenge = { pairingId: res.pairingId, challenge: res.challenge };
    return {
      pairingId: res.pairingId,
      // Never expose raw challenge to Renderer (PRD §23).
      code: null,
      expiresAt: res.expiresAt ?? null,
      message: "Confirm pairing in Desktop to continue",
    };
  } catch (err) {
    if (err instanceof CopilotRuntimeHttpError) {
      return {
        pairingId: "",
        code: null,
        expiresAt: null,
        message: err.runtimeError.message,
      };
    }
    throw err;
  }
}

export async function confirmPairing(pairingId: string): Promise<RuntimePairingConfirmResult> {
  const challenge =
    pendingChallenge && pendingChallenge.pairingId === pairingId
      ? pendingChallenge.challenge
      : pendingChallenge?.challenge;

  if (!challenge) {
    return {
      ok: false,
      deviceId: null,
      message: "Missing pairing challenge; call startPairing() first",
    };
  }

  try {
    const res = await runtimeFetch<PairingConfirmResponse>({
      method: "POST",
      path: `/api/v1/pairings/${encodeURIComponent(pairingId)}/confirm`,
      unauthenticated: true,
      body: {
        challenge,
        deviceName: "SMC-Copilot-Desktop",
      },
    });

    const persistence = await saveDeviceToken(res.deviceToken, {
      deviceId: res.deviceId,
      deviceName: res.name || "SMC-Copilot-Desktop",
      pairedAt: new Date().toISOString(),
    });
    pendingChallenge = null;
    console.log(
      `[copilot-runtime] pairing confirmed device=${res.deviceId} persistence=${persistence}`,
    );

    return {
      ok: true,
      deviceId: res.deviceId,
      message: persistence === "memory-only" ? "DEVICE_TOKEN_NOT_PERSISTED" : null,
    };
  } catch (err) {
    if (err instanceof CopilotRuntimeHttpError) {
      const code = err.runtimeError.code;
      const msg = err.runtimeError.message.toLowerCase();
      if (code === "PAIRING_EXPIRED" || msg.includes("expired")) {
        pendingChallenge = null;
      }
      return {
        ok: false,
        deviceId: null,
        message: err.runtimeError.message,
      };
    }
    throw err;
  }
}

function failure(
  code: string,
  message: string,
  retryable: boolean,
  persistence?: DeviceTokenPersistence,
): RuntimePairAndConnectResult {
  return {
    ok: false,
    state: getRuntimeConnectionState(),
    deviceId: getDeviceMetaSync()?.deviceId ?? null,
    error: { code, message, retryable },
    persistence,
  };
}

async function doPairAndConnect(): Promise<RuntimePairAndConnectResult> {
  const current = getRuntimeConnectionState();

  if (current.state !== "PairingRequired" && current.state !== "Ready") {
    return failure(
      "PAIRING_NOT_ALLOWED",
      `Pairing cannot start from ${current.state}`,
      true,
    );
  }

  if (current.state === "Ready") {
    return {
      ok: true,
      state: current,
      deviceId: getDeviceMetaSync()?.deviceId ?? current.deviceId ?? null,
      error: null,
      persistence: "secure",
    };
  }

  const start = await startPairing();
  if (!start.pairingId) {
    return failure(
      "PAIRING_START_FAILED",
      start.message ?? "Failed to start pairing",
      true,
    );
  }

  let confirmed: RuntimePairingConfirmResult;
  try {
    confirmed = await confirmPairing(start.pairingId);
  } catch (err) {
    return failure(
      "PAIRING_CONFIRM_FAILED",
      err instanceof Error ? err.message : String(err),
      true,
    );
  }

  if (!confirmed.ok) {
    const msg = (confirmed.message ?? "").toLowerCase();
    const expired = msg.includes("expired");
    return failure(
      expired ? "PAIRING_EXPIRED" : "PAIRING_CONFIRM_FAILED",
      confirmed.message ?? "Pairing confirm failed",
      true,
    );
  }

  const state = await runRuntimeHandshake();
  const persistence: DeviceTokenPersistence =
    confirmed.message === "DEVICE_TOKEN_NOT_PERSISTED" ? "memory-only" : "secure";

  if (state.state === "Ready") {
    console.log("[copilot-runtime] post-pair handshake Ready");
    return {
      ok: true,
      state,
      deviceId: confirmed.deviceId,
      error:
        persistence === "memory-only"
          ? {
              code: "DEVICE_TOKEN_NOT_PERSISTED",
              message:
                "Device authorization will be lost when Desktop exits (secure store unavailable).",
              retryable: false,
            }
          : null,
      persistence,
    };
  }

  return {
    ok: false,
    state,
    deviceId: confirmed.deviceId,
    error: {
      code: state.lastErrorCode ?? "PAIRING_HANDSHAKE_FAILED",
      message: state.lastError ?? "Runtime did not enter Ready state",
      retryable: true,
    },
    persistence,
  };
}

/**
 * Atomic pairing transaction owned by Main (PRD v1.3.2).
 * Concurrent callers share one in-flight Promise.
 */
export async function pairAndConnect(): Promise<RuntimePairAndConnectResult> {
  if (pairAndConnectInFlight) {
    return pairAndConnectInFlight;
  }
  pairAndConnectInFlight = doPairAndConnect().finally(() => {
    pairAndConnectInFlight = null;
  });
  return pairAndConnectInFlight;
}
