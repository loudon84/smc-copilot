import { existsSync } from "fs";
import { getHermesRepo } from "../installer";
import { isPortOccupied, resolveProfileId } from "../profile-runtime-manager";
import { checkPortConflict } from "../profile-runtime-db";
import { profileHome } from "../utils";
import { getExpertInstanceByProfileId } from "./expert-runtime-db";

export type ExpertPreflightInput = {
  profileId: string;
  port?: number;
};

export type ExpertPreflightResult = {
  ok: boolean;
  errorCode?: string;
  message?: string;
  warnings?: string[];
};

export async function runExpertPreflight(input: ExpertPreflightInput): Promise<ExpertPreflightResult> {
  const warnings: string[] = [];
  const home = profileHome(input.profileId);

  if (!existsSync(home)) {
    return {
      ok: false,
      errorCode: "EXPERT_PROFILE_HOME_MISSING",
      message: `Profile home not found: ${home}`,
    };
  }

  const port =
    input.port ??
    getExpertInstanceByProfileId(input.profileId)?.gatewayPort ??
    undefined;

  if (port != null) {
    const conflict = checkPortConflict("127.0.0.1", port, resolveProfileId(input.profileId));
    if (conflict) {
      return {
        ok: false,
        errorCode: "EXPERT_PORT_CONFLICT",
        message: `Port ${port} is already assigned to ${conflict.profile_id}`,
      };
    }
    const occupied = await isPortOccupied(port);
    if (occupied) {
      warnings.push(`Port ${port} appears occupied on loopback; summon may fail if not this profile's gateway`);
    }
  }

  if (!existsSync(getHermesRepo())) {
    return {
      ok: false,
      errorCode: "HERMES_AGENT_NOT_INSTALLED",
      message: "Hermes Agent runtime is not installed. Complete Local Install first.",
    };
  }

  try {
    const res = await fetch("http://127.0.0.1:8765/health", {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      warnings.push("copilot-serve is unreachable; team delegation may be degraded");
    }
  } catch {
    warnings.push("copilot-serve is unreachable; team delegation may be degraded");
  }

  return { ok: true, warnings };
}
