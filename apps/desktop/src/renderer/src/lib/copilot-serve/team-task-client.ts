import { copilotServeFetch, type CopilotServeHttpConfig } from "./http-client";
export async function pullTeamTasks(
  config: CopilotServeHttpConfig,
): Promise<{ received: number; ingested: number }> {
  return copilotServeFetch<{ received: number; ingested: number }>(
    config,
    "/api/v1/team-tasks/pull",
    { method: "POST" },
  );
}
