import { restartGatewayAsync, isGatewayRunningAsync } from "../hermes";
import { restartProfile } from "../profile-runtime-manager";
import { probeGatewayHealth } from "../gateway-health";
import { GeneHubError } from "../../shared/genehub/genehub-errors";
import type { HermesProfileDto } from "../../shared/genehub/genehub-contract";

export async function reloadOrRestart(profile: HermesProfileDto): Promise<{
  ok: boolean;
  mode: "reload" | "restart";
  error?: string;
}> {
  try {
    if (profile.profileName === "default") {
      const restarted = await restartGatewayAsync();
      if (!restarted) {
        throw new GeneHubError("HERMES_HEALTH_CHECK_FAILED", "Gateway restart failed");
      }
      const healthy = await waitForGatewayHealth(profile.gatewayUrl ?? "http://127.0.0.1:8642", 8642);
      if (!healthy) {
        throw new GeneHubError("HERMES_HEALTH_CHECK_FAILED", "Gateway health check failed after restart");
      }
      return { ok: true, mode: "restart" };
    }

    await restartProfile(profile.profileId);
    const healthy = await waitForGatewayHealth(
      profile.gatewayUrl ?? `http://127.0.0.1:${profile.gatewayPort ?? 8642}`,
      profile.gatewayPort ?? 8642,
    );
    if (!healthy) {
      throw new GeneHubError("HERMES_HEALTH_CHECK_FAILED", "Profile gateway health check failed");
    }
    return { ok: true, mode: "restart" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restart failed";
    return {
      ok: false,
      mode: "restart",
      error: message,
    };
  }
}

function parseGatewayHostPort(gatewayUrl: string, fallbackPort: number): { host: string; port: number } {
  try {
    const url = new URL(gatewayUrl);
    return {
      host: url.hostname || "127.0.0.1",
      port: url.port ? Number(url.port) : fallbackPort,
    };
  } catch {
    return { host: "127.0.0.1", port: fallbackPort };
  }
}

async function waitForGatewayHealth(gatewayUrl: string, fallbackPort: number, attempts = 10): Promise<boolean> {
  const { host, port } = parseGatewayHostPort(gatewayUrl, fallbackPort);
  for (let i = 0; i < attempts; i += 1) {
    const healthy = await probeGatewayHealth(host, port);
    if (healthy) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return isGatewayRunningAsync();
}
