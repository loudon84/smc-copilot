import type { WorkTask } from "../../../../../shared/work/work-task-contract";

const now = new Date().toISOString();

export const MOCK_TASKS: WorkTask[] = [
  {
    id: "task-mock-sales-001",
    title: "陕西天基通信 — 销售电话准备",
    sessionId: "mock-session-sales-001",
    profile: "default",
    source: "work_home",
    permissionMode: "default",
    taskType: "expert_team",
    status: "completed",
    sourceWorkspace: "work",
    activeTeamId: "sales-combat-team",
    selectedExpertIds: [],
    selectedSkillIds: [],
    selectedAppIds: [],
    contextRefs: [],
    outputRefs: [{ id: "out-report-001", name: "销售作战报告.md", type: "markdown" }],
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  },
];

export function createDraftTask(title: string, teamId?: string): WorkTask {
  const id = `task-${crypto.randomUUID()}`;
  const ts = new Date().toISOString();
  return {
    id,
    title: title.slice(0, 120) || "新任务",
    sessionId: `draft-${id}`,
    profile: "default",
    source: "work_home",
    permissionMode: "default",
    taskType: teamId ? "expert_team" : "chat",
    status: "draft",
    sourceWorkspace: "work",
    activeTeamId: teamId,
    selectedExpertIds: [],
    selectedSkillIds: [],
    selectedAppIds: [],
    contextRefs: [],
    outputRefs: [],
    createdAt: ts,
    updatedAt: ts,
  };
}
