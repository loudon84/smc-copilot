import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { taskClient } from "../copilot-runtime-client/clients/task-client";
import { hasFeature } from "../copilot-runtime-client/runtime-capability-manager";
import {
  WORK_TASKS_CHANNELS,
  WORK_TASKS_V2_FEATURE,
  type WorkTaskAssignInput,
  type WorkTaskCreateInput,
  type WorkTaskDto,
  type WorkTaskEventDto,
  type WorkTaskEventPush,
  type WorkTaskListParams,
  type WorkTaskListResult,
  type WorkTaskRunDto,
  type WorkTaskSnapshotDto,
  type WorkTaskStartResultDto,
  type WorkTaskSubscribeInput,
  type WorkTaskSubscribeResult,
} from "../../shared/work-tasks/work-tasks-contract";
import type {
  TaskEventResponse,
  TaskRunResponse,
  TaskStartResult,
  WorkTaskResponse,
} from "@smc/runtime-client";

type SubEntry = {
  taskId: string;
  controller: AbortController;
};

const subscriptions = new Map<string, SubEntry>();
let getWindow: (() => BrowserWindow | null) | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapTask(raw: WorkTaskResponse): WorkTaskDto {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? null,
    taskType: raw.taskType,
    source: raw.source,
    status: raw.status,
    priority: raw.priority,
    profileId: raw.profileId ?? null,
    assignedProfileId: raw.assignedProfileId ?? null,
    assignedInstanceId: raw.assignedInstanceId ?? null,
    instanceId: raw.instanceId ?? null,
    activeRunId: raw.activeRunId ?? null,
    chatRunId: raw.chatRunId ?? null,
    errorCode: raw.errorCode ?? null,
    errorMessage: raw.errorMessage ?? null,
    resultSummary: raw.resultSummary ?? null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    completedAt: raw.completedAt ?? null,
  };
}

function mapRun(raw: TaskRunResponse): WorkTaskRunDto {
  return {
    id: raw.id,
    taskId: raw.taskId,
    runNumber: raw.runNumber,
    status: raw.status,
    chatRunId: raw.chatRunId ?? null,
    hermesSessionId: raw.hermesSessionId ?? null,
    startedAt: raw.startedAt ?? null,
    finishedAt: raw.finishedAt ?? null,
    errorCode: raw.errorCode ?? null,
    errorDetail: raw.errorDetail ?? null,
  };
}

function mapEvent(raw: TaskEventResponse): WorkTaskEventDto {
  return {
    id: raw.id,
    taskId: raw.taskId,
    runId: raw.runId,
    sequence: raw.sequence,
    eventType: raw.eventType,
    payload: (raw.payload as Record<string, unknown> | null | undefined) ?? null,
    createdAt: raw.createdAt ?? null,
    schemaVersion: raw.schemaVersion,
  };
}

function mapStartResult(raw: TaskStartResult): WorkTaskStartResultDto {
  return {
    taskId: raw.taskId,
    runId: raw.runId ?? null,
    status: raw.status,
  };
}

function parseEventFromSse(
  taskId: string,
  message: { id?: string | null; event?: string | null; data: string },
): WorkTaskEventDto | null {
  if (!message.data?.trim()) return null;
  if (message.event === "ping") return null;
  try {
    const parsed = asRecord(JSON.parse(message.data) as unknown);
    if (parsed.type === "ping") return null;
    const id =
      (typeof parsed.id === "string" && parsed.id) ||
      message.id ||
      randomUUID();
    const eventType = String(
      message.event ?? parsed.eventType ?? parsed.event_type ?? "task.event",
    );
    return {
      id,
      taskId: String(parsed.taskId ?? parsed.task_id ?? taskId),
      runId: String(parsed.runId ?? parsed.run_id ?? ""),
      sequence:
        typeof parsed.sequence === "number"
          ? parsed.sequence
          : Number(parsed.sequence ?? 0) || 0,
      eventType,
      payload:
        (parsed.payload as Record<string, unknown> | null | undefined) ??
        (Object.keys(parsed).length > 0 ? parsed : null),
      createdAt:
        (typeof parsed.createdAt === "string" && parsed.createdAt) ||
        (typeof parsed.created_at === "string" && parsed.created_at) ||
        new Date().toISOString(),
      schemaVersion:
        typeof parsed.schemaVersion === "string"
          ? parsed.schemaVersion
          : typeof parsed.schema_version === "string"
            ? parsed.schema_version
            : "1",
    };
  } catch {
    return null;
  }
}

function pushEvent(payload: WorkTaskEventPush): void {
  const win = getWindow?.();
  win?.webContents.send(WORK_TASKS_CHANNELS.event, payload);
}

function stopSubscription(subscriptionId: string): void {
  const entry = subscriptions.get(subscriptionId);
  if (!entry) return;
  entry.controller.abort();
  subscriptions.delete(subscriptionId);
}

export function registerWorkTasksIpc(getMainWindow: () => BrowserWindow | null): void {
  getWindow = getMainWindow;

  ipcMain.handle(WORK_TASKS_CHANNELS.hasWorkV2, async (): Promise<boolean> => {
    return hasFeature(WORK_TASKS_V2_FEATURE);
  });

  ipcMain.handle(
    WORK_TASKS_CHANNELS.list,
    async (_e, params?: WorkTaskListParams): Promise<WorkTaskListResult> => {
      const result = await taskClient.list(params);
      return {
        items: result.items.map(mapTask),
        nextCursor: result.nextCursor ?? null,
      };
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.get,
    async (_e, taskId: string): Promise<WorkTaskDto> => {
      return mapTask(await taskClient.get(taskId));
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.create,
    async (_e, input: WorkTaskCreateInput): Promise<WorkTaskDto> => {
      const created = await taskClient.create({
        title: input.title,
        taskType: input.taskType ?? "coding",
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        profileId: input.profileId ?? null,
        instanceId: input.instanceId ?? null,
        priority: input.priority ?? 0,
        source: input.source ?? "local",
      });
      return mapTask(created);
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.start,
    async (_e, taskId: string): Promise<WorkTaskStartResultDto> => {
      return mapStartResult(await taskClient.start(taskId));
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.cancel,
    async (_e, taskId: string): Promise<WorkTaskDto> => {
      return mapTask(await taskClient.cancel(taskId));
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.retry,
    async (_e, taskId: string): Promise<WorkTaskStartResultDto> => {
      return mapStartResult(await taskClient.retry(taskId));
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.assign,
    async (_e, taskId: string, input: WorkTaskAssignInput): Promise<WorkTaskDto> => {
      return mapTask(
        await taskClient.assign(taskId, {
          profileId: input.profileId,
          instanceId: input.instanceId ?? null,
        }),
      );
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.getSnapshot,
    async (_e, taskId: string): Promise<WorkTaskSnapshotDto> => {
      const snap = await taskClient.getSnapshot(taskId);
      return {
        task: mapTask(snap.task),
        activeRun: snap.activeRun ? mapRun(snap.activeRun) : null,
        runs: snap.activeRun ? [mapRun(snap.activeRun)] : [],
        events: (snap.events ?? []).map(mapEvent),
      };
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.subscribeEvents,
    async (_e, input: WorkTaskSubscribeInput): Promise<WorkTaskSubscribeResult> => {
      const subscriptionId = randomUUID();
      const controller = new AbortController();
      subscriptions.set(subscriptionId, { taskId: input.taskId, controller });

      void (async () => {
        try {
          for await (const message of taskClient.streamEvents(input.taskId, {
            lastEventId: input.lastEventId ?? undefined,
            signal: controller.signal,
          })) {
            const event = parseEventFromSse(input.taskId, message);
            pushEvent({
              taskId: input.taskId,
              subscriptionId,
              event,
              raw: {
                id: message.id ?? null,
                event: message.event ?? null,
                data: message.data,
              },
            });
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            console.warn("[work-tasks] SSE error", input.taskId, err);
          }
        } finally {
          subscriptions.delete(subscriptionId);
        }
      })();

      return { ok: true, subscriptionId };
    },
  );

  ipcMain.handle(
    WORK_TASKS_CHANNELS.unsubscribeEvents,
    async (_e, subscriptionId: string): Promise<{ ok: boolean }> => {
      stopSubscription(subscriptionId);
      return { ok: true };
    },
  );
}

export function shutdownWorkTasksIpc(): void {
  for (const id of [...subscriptions.keys()]) {
    stopSubscription(id);
  }
}
