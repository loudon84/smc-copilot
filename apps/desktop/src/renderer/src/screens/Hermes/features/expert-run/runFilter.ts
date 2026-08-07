import type { ExpertRunFilter, HermesExpertRunStatus } from "../../../../../../shared/hermes-experts/hermes-experts-contract";

export type RunFilterKey = HermesExpertRunStatus | "all";

export const RUN_FILTERS: Array<{ key: RunFilterKey; labelKey: string }> = [
  { key: "all", labelKey: "workspaces.hermes.expertRuns.filterAll" },
  { key: "running", labelKey: "workspaces.hermes.expertRuns.filterRunning" },
  { key: "waiting_approval", labelKey: "workspaces.hermes.expertRuns.filterWaiting" },
  { key: "completed", labelKey: "workspaces.hermes.expertRuns.filterCompleted" },
  { key: "failed", labelKey: "workspaces.hermes.expertRuns.filterFailed" },
];

export function toExpertRunFilter(filter: RunFilterKey): ExpertRunFilter | undefined {
  if (filter === "all") return undefined;
  return { status: filter };
}
