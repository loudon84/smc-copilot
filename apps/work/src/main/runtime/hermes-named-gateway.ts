/**
 * Named-profile Gateway install/start/uninstall (PRD C-004 / A-GW-003/004).
 * Work exit must not stop/uninstall (A-GW-002) — handled by stop-gateway IPC.
 */
import { getProfilePort } from "../gateway-ports";
import { runHermesCliSync } from "./hermes-cli-runner";
import { probeGatewayHealth } from "./gateway-probe";
import { getGatewayBaseUrl } from "./hermes-runtime-config";

function profileArgs(profile: string, sub: string[]): string[] {
  if (!profile || profile === "default") return sub;
  return ["-p", profile, ...sub];
}

function endpointForProfile(profile?: string): string {
  if (!profile || profile === "default") {
    return getGatewayBaseUrl();
  }
  const port = getProfilePort(profile);
  return `http://127.0.0.1:${port}`;
}

export function installProfileGateway(profile?: string): void {
  const name = profile && profile !== "default" ? profile : undefined;
  if (name) {
    // Persist non-colliding port before install (C-004 step 1).
    getProfilePort(name);
  }
  try {
    runHermesCliSync(profileArgs(name ?? "default", ["gateway", "install"]), 60_000);
  } catch {
    /* install may report already-installed; health decides */
  }
}

export async function ensureProfileGatewayStarted(
  profile?: string,
): Promise<boolean> {
  const name = profile && profile !== "default" ? profile : undefined;
  if (name) getProfilePort(name);
  installProfileGateway(name);

  const endpoint = endpointForProfile(name);
  if (await probeGatewayHealth(endpoint)) return true;

  try {
    runHermesCliSync(
      profileArgs(name ?? "default", ["gateway", "start"]),
      60_000,
    );
  } catch {
    /* health poll decides */
  }
  return probeGatewayHealth(endpoint);
}

export function uninstallProfileGateway(profile: string): void {
  if (!profile || profile === "default") return;
  try {
    runHermesCliSync(["-p", profile, "gateway", "uninstall"], 60_000);
  } catch {
    /* best-effort on delete */
  }
}
