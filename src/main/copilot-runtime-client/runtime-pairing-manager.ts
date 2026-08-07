import type {
  RuntimePairingConfirmResult,
  RuntimePairingStartResult,
} from "../../shared/copilot-runtime";
import { saveDeviceToken } from "./runtime-auth-store";
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

export function getPendingPairingChallenge(): string | null {
  return pendingChallenge?.challenge ?? null;
}

export async function startPairing(): Promise<RuntimePairingStartResult> {
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
      code: res.challenge,
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

    await saveDeviceToken(res.deviceToken, {
      deviceId: res.deviceId,
      deviceName: res.name || "SMC-Copilot-Desktop",
      pairedAt: new Date().toISOString(),
    });
    pendingChallenge = null;

    return {
      ok: true,
      deviceId: res.deviceId,
      message: null,
    };
  } catch (err) {
    if (err instanceof CopilotRuntimeHttpError) {
      return {
        ok: false,
        deviceId: null,
        message: err.runtimeError.message,
      };
    }
    throw err;
  }
}
