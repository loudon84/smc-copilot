import { existsSync } from "fs";
import { listProfiles, getRuntimeInstance } from "../profile-runtime-db";
import { profileHome } from "../utils";
import type { HermesProfileDto } from "../../shared/genehub/genehub-contract";
import { GeneHubError } from "../../shared/genehub/genehub-errors";

const DEFAULT_GATEWAY_PORT = 8642;

export function resolveHermesProfiles(): HermesProfileDto[] {
  const profiles = listProfiles();
  const records = listProfiles();
  const result: HermesProfileDto[] = [];
  const defaultRecord = records.find((p) => p.name === "default");
  const defaultHome = defaultRecord?.profile_home || profileHome("default");

  if (existsSync(defaultHome)) {
    result.push(
      buildProfileDto(
        defaultRecord?.id ?? "default",
        "default",
        defaultHome,
      ),
    );
  }

  for (const record of records) {
    if (record.name === "default") continue;

    const home = record.profile_home || profileHome(record.name);

    if (!existsSync(home)) {
      console.warn("[GENEHUB] skip missing Hermes profile home:", {
        profile: record.name,
        home,
      });
      continue;
    }

    result.push(buildProfileDto(record.id, record.name, home));
  }

  if (result.length === 0) {
    throw new GeneHubError(
      "HERMES_HOME_NOT_FOUND",
      `Hermes home not found: ${defaultHome}`,
    );
  }

  return result;

}

export function resolveHermesProfile(profileIdOrName?: string): HermesProfileDto {
  const profiles = resolveHermesProfiles();


  if (!profileIdOrName) {
    const fallback = profiles.find((p) => p.profileName === "default");
    if (fallback) return fallback;

    if (profiles[0]) return profiles[0];

    throw new GeneHubError("HERMES_HOME_NOT_FOUND", "No Hermes profile available");
  }

  const match =
    profiles.find((p) => p.profileId === profileIdOrName) ??
    profiles.find((p) => p.profileName === profileIdOrName);

  if (!match) {
    throw new GeneHubError("HERMES_HOME_NOT_FOUND", `Hermes profile not found: ${profileIdOrName}`);
  }

  return match;


}

function buildProfileDto(
  profileId: string,
  profileName: string,
  hermesHome: string,
): HermesProfileDto {
  if (!existsSync(hermesHome)) {
    throw new GeneHubError("HERMES_HOME_NOT_FOUND", `Hermes home not found: ${hermesHome}`);
  }

  const runtime = getRuntimeInstance(profileId);
  const gatewayPort = runtime?.port ?? DEFAULT_GATEWAY_PORT;
  const gatewayUrl = runtime?.base_url ?? `http://127.0.0.1:${gatewayPort}`;

  return {
    profileName,
    profileId,
    hermesHome,
    gatewayUrl,
    gatewayPort,
    runtimeVersion: undefined,
    capabilities: {
      skills: true,
      scripts: true,
      reload: false,
    },
  };
}
