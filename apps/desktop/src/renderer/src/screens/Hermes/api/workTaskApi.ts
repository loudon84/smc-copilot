import type { WorkTaskEvent } from "../../../../../shared/work/work-event-contract";
import type {
  WorkTask,
  WorkTaskListQuery,
  WorkTaskPermissionMode,
  WorkTaskResumeResult,
  WorkTaskSendInput,
  WorkTaskSendResult,
  WorkTaskStartInput,
  WorkTaskStartResult,
} from "../../../../../shared/work/work-task-contract";
import { HERMES_DEFAULT_PROFILE } from "../constants";
import { workApi } from "./workApi";
import { buildWorkTaskFirstMessage, deriveTaskTitle } from "./workTaskMessageBuilder";
import { hermesDefaultApi } from "./hermesDefaultApi";

function workBridge(): NonNullable<typeof window.work> {
  if (!window.work?.task) {
    throw new Error("window.work.task is not available");
  }
  return window.work;
}

function hermesChat() {
  if (!window.hermesDefaultChat) {
    throw new Error("window.hermesDefaultChat is not available");
  }
  return window.hermesDefaultChat;
}

async function resolveTeamName(teamId?: string): Promise<string | undefined> {
  if (!teamId) return undefined;
  const team = await workApi.teams.get(teamId);
  return team?.displayName;
}

async function resolveExpertNames(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const experts = await workApi.experts.list();
  return ids
    .map((id) => experts.find((e) => e.id === id)?.displayName ?? id)
    .filter(Boolean);
}

async function resolveSkillNames(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  try {
    const skills = await hermesDefaultApi.skills.installed();
    return ids.map((id) => skills.find((s) => s.name === id)?.name ?? id);
  } catch {
    return ids;
  }
}

export const workTaskApi = {
  async startTask(input: WorkTaskStartInput): Promise<WorkTaskStartResult> {
    const profile = input.profile ?? HERMES_DEFAULT_PROFILE;
    const prompt = input.prompt.trim();
    if (!prompt) {
      return { ok: false, taskId: "", sessionId: "", profile, error: "PROMPT_REQUIRED" };
    }

    const teamName = await resolveTeamName(input.selectedTeamId);
    const expertNames = await resolveExpertNames(input.selectedExpertIds ?? []);
    const skillNames = await resolveSkillNames(input.selectedSkillIds ?? []);
    const title = deriveTaskTitle(prompt);
    const message = buildWorkTaskFirstMessage({
      title,
      userPrompt: prompt,
      teamName,
      expertNames,
      skillNames,
      appNames: input.selectedAppIds,
      permissionMode: input.permissionMode ?? "default",
      contextRefs: input.contextRefs,
    });

    const workMode =
      input.mode === "ask" || input.mode === "plan" || input.mode === "craft"
        ? input.mode
        : undefined;

    try {
      const result = await hermesChat().sendMessage({
        message,
        profile,
        resumeSessionId: input.resumeSessionId,
        attachment_ids: input.attachmentIds,
        team_id: input.selectedTeamId,
        work_mode: workMode,
        invocation_source: input.selectedTeamId ? "team_chat" : "default_chat",
      });

      const sessionId = result.sessionId ?? input.resumeSessionId;
      if (!sessionId) {
        return { ok: false, taskId: "", sessionId: "", profile, error: "SESSION_ID_MISSING" };
      }

      const now = new Date().toISOString();
      const task: WorkTask = {
        id: crypto.randomUUID(),
        title,
        sessionId,
        profile,
        taskType: input.selectedTeamId ? "expert_team" : "chat",
        status: "running",
        source: input.resumeSessionId ? "session_resume" : "work_home",
        sourceWorkspace: "work",
        activeTeamId: input.selectedTeamId,
        selectedExpertIds: input.selectedExpertIds ?? [],
        selectedSkillIds: input.selectedSkillIds ?? [],
        selectedAppIds: input.selectedAppIds ?? [],
        permissionMode: input.permissionMode ?? "default",
        mode: input.mode,
        contextRefs: input.contextRefs ?? [],
        outputRefs: [],
        createdAt: now,
        updatedAt: now,
      };

      const persisted = await workBridge().task.start({ ...input, task });
      return persisted;
    } catch (err) {
      return {
        ok: false,
        taskId: "",
        sessionId: "",
        profile,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async resumeTask(taskId: string, profile?: string): Promise<WorkTaskResumeResult> {
    return workBridge().task.resume(taskId, profile);
  },

  async list(query?: WorkTaskListQuery): Promise<WorkTask[]> {
    const stored = await workBridge().task.list(HERMES_DEFAULT_PROFILE);
    if (!query?.status?.length) return stored;
    return stored.filter((t) => query.status?.includes(t.status));
  },

  async listRecentTasks(limit = 12): Promise<WorkTask[]> {
    const [sessions, metadata] = await Promise.all([
      hermesDefaultApi.sessions.list(limit, 0),
      workBridge().task.list(HERMES_DEFAULT_PROFILE),
    ]);

    const bySession = new Map(metadata.map((t) => [t.sessionId, t]));
    const merged: WorkTask[] = [];

    for (const session of sessions) {
      const meta = bySession.get(session.id);
      if (meta) {
        merged.push({
          ...meta,
          title: meta.title || session.title || "任务",
          updatedAt: new Date(session.startedAt).toISOString(),
        });
      } else {
        merged.push({
          id: `session-${session.id}`,
          title: session.title || "Hermes 会话",
          sessionId: session.id,
          profile: HERMES_DEFAULT_PROFILE,
          taskType: "chat",
          status: "completed",
          source: "session_resume",
          sourceWorkspace: "work",
          selectedExpertIds: [],
          selectedSkillIds: [],
          selectedAppIds: [],
          permissionMode: "default",
          contextRefs: [],
          outputRefs: [],
          createdAt: new Date(session.startedAt).toISOString(),
          updatedAt: new Date(session.startedAt).toISOString(),
        });
      }
    }

    for (const task of metadata) {
      if (!merged.some((m) => m.sessionId === task.sessionId)) {
        merged.push(task);
      }
    }

    return merged
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  },

  async get(taskId: string): Promise<WorkTask | null> {
    const list = await workBridge().task.list(HERMES_DEFAULT_PROFILE);
    return list.find((t) => t.id === taskId) ?? null;
  },

  async getBySessionId(sessionId: string): Promise<WorkTask | null> {
    return workBridge().task.getBySession(sessionId, HERMES_DEFAULT_PROFILE);
  },

  /** @deprecated use startTask */
  async create(_input: WorkTaskSendInput): Promise<WorkTask> {
    throw new Error("workTaskApi.create is deprecated — use startTask");
  },

  /** @deprecated use Hermes chat in task window */
  async send(_input: WorkTaskSendInput): Promise<WorkTaskSendResult> {
    return { taskId: "", ok: false, error: "use HermesDefaultWebChatSurface" };
  },

  async stop(_taskId: string): Promise<void> {
    await hermesChat().abort();
  },

  subscribe(_taskId: string, _callback: (event: WorkTaskEvent) => void): () => void {
    return () => undefined;
  },
};
