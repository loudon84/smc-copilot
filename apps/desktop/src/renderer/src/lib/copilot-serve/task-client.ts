import { copilotServeFetch, type CopilotServeHttpConfig } from "./http-client";
import type { LocalTask, TaskWorkbenchSummary } from "./types";

export async function listTasks(config: CopilotServeHttpConfig): Promise<LocalTask[]> {
  return copilotServeFetch<LocalTask[]>(config, "/api/v1/tasks");
}

export async function getTask(config: CopilotServeHttpConfig, taskId: string): Promise<LocalTask> {
  return copilotServeFetch<LocalTask>(config, `/api/v1/tasks/${taskId}`);
}

export async function createTask(
  config: CopilotServeHttpConfig,
  body: { title: string; task_type?: string; description?: string },
): Promise<LocalTask> {
  return copilotServeFetch<LocalTask>(config, "/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: body.title,
      task_type: body.task_type ?? "coding_task",
      description: body.description,
    }),
  });
}

export async function bindProfile(
  config: CopilotServeHttpConfig,
  taskId: string,
  profileId: string,
): Promise<LocalTask> {
  return copilotServeFetch<LocalTask>(config, `/api/v1/tasks/${taskId}/bind-profile`, {
    method: "POST",
    body: JSON.stringify({ profile_id: profileId }),
  });
}

export async function runTask(config: CopilotServeHttpConfig, taskId: string): Promise<LocalTask> {
  return copilotServeFetch<LocalTask>(config, `/api/v1/tasks/${taskId}/run`, { method: "POST" });
}

export async function cancelTask(config: CopilotServeHttpConfig, taskId: string): Promise<LocalTask> {
  return copilotServeFetch<LocalTask>(config, `/api/v1/tasks/${taskId}/cancel`, { method: "POST" });
}

export async function getWorkbenchSummary(
  config: CopilotServeHttpConfig,
): Promise<TaskWorkbenchSummary> {
  return copilotServeFetch<TaskWorkbenchSummary>(
    config,
    "/api/v1/desktop/task-workbench/summary",
  );
}
