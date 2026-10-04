import { app } from "electron";
import type { RemoteExpertAvailability, RemoteExpertGateMode } from "../../shared/remote-expert-acp/contract";
import { REMOTE_EXPERT_FEATURE_ENV } from "../../shared/remote-expert-acp/contract";
import type { ContractLockFile } from "./contract-lock";

function parseMode(raw: string | undefined, packed: boolean): RemoteExpertGateMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "off") return "off";
  if (value === "alpha") return "alpha";
  return packed ? "off" : "alpha";
}

export function evaluateRemoteExpertFeatureGate(input: {
  packed: boolean;
  envValue?: string;
  lock: Pick<ContractLockFile, "frontendContractGate" | "productionGate">;
}): RemoteExpertAvailability {
  const mode = parseMode(input.envValue ?? process.env[REMOTE_EXPERT_FEATURE_ENV], input.packed);
  if (input.lock.frontendContractGate !== "passed") {
    return {
      enabled: false,
      mode,
      packed: input.packed,
      reason: "frontend contract gate is not passed",
      errorCode: "ACP_CONTRACT_INCOMPATIBLE",
    };
  }
  if (mode === "off") {
    return {
      enabled: false,
      mode,
      packed: input.packed,
      reason: input.packed && input.lock.productionGate === "unpassed"
        ? "production gate unpassed; default off"
        : "remote expert disabled",
      errorCode: input.packed && input.lock.productionGate === "unpassed"
        ? "REMOTE_EXPERT_PRODUCTION_GATE_BLOCKED"
        : undefined,
    };
  }
  return { enabled: true, mode: "alpha", packed: input.packed };
}

export function isPackagedApp(): boolean {
  try {
    return Boolean(app?.isPackaged);
  } catch {
    return false;
  }
}
