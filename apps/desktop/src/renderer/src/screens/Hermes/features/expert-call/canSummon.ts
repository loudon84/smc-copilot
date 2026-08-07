import type { WorkExpert } from "../../model/expert";
import type { WorkExpertTeam } from "../../model/expert-team";

export function canSummonExpert(expert: WorkExpert): boolean {
  if (expert.executionMode === "remote_mcp" || expert.profileId === "remote") {
    if (expert.status !== "ready") return false;
    if (expert.skillCount === 0) return false;
    return true;
  }
  return expert.installStatus === "installed";
}

export function canSummonTeam(team: WorkExpertTeam): boolean {
  if (team.executionMode === "remote_mcp") {
    if (team.status !== "ready") return false;
    if ((team.skillCount ?? 0) === 0) return false;
    return true;
  }
  return team.installStatus === "installed";
}
