import type { WorkExpert } from "../../model/expert";
import type { WorkExpertTeam } from "../../model/expert-team";
import { canSummonExpert, canSummonTeam } from "../expert-call/canSummon";

export function pickRecommendedExperts(experts: WorkExpert[], limit: number): WorkExpert[] {
  return [...experts]
    .sort((a, b) => {
      const aReady = canSummonExpert(a) ? 1 : 0;
      const bReady = canSummonExpert(b) ? 1 : 0;
      if (bReady !== aReady) return bReady - aReady;
      return (b.skillCount ?? 0) - (a.skillCount ?? 0);
    })
    .slice(0, limit);
}

export function pickRecommendedTeams(teams: WorkExpertTeam[], limit: number): WorkExpertTeam[] {
  return [...teams]
    .sort((a, b) => {
      const aReady = canSummonTeam(a) ? 1 : 0;
      const bReady = canSummonTeam(b) ? 1 : 0;
      if (bReady !== aReady) return bReady - aReady;
      return (b.skillCount ?? 0) - (a.skillCount ?? 0);
    })
    .slice(0, limit);
}
