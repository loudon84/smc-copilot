import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { approve, listPendingApprovals, reject } from "../../lib/copilot-serve/approval-client";
import {
  bindProfile,
  cancelTask,
  createTask,
  getTask,
  getWorkbenchSummary,
  listTasks,
  runTask,
} from "../../lib/copilot-serve/task-client";
import { pullTeamTasks } from "../../lib/copilot-serve/team-task-client";
import type { ApprovalRecord, LocalTask, TaskEventRecord, TaskWorkbenchSummary } from "../../lib/copilot-serve/types";
import { useCopilotHttpConfig } from "../../lib/copilot-serve/use-copilot-http-config";
import { subscribeSse, type SseMessage } from "../../lib/copilot-serve/workbench-stream";

export function TaskWorkbenchScreen(): React.JSX.Element {
  const { config, loading, error, refresh } = useCopilotHttpConfig();
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LocalTask | null>(null);
  const [timeline, setTimeline] = useState<TaskEventRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRecord[]>([]);
  const [summary, setSummary] = useState<TaskWorkbenchSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string }>>([]);
  const lastGlobalEventIdRef = useRef<string | undefined>(undefined);
  const lastTimelineEventIdRef = useRef<string | undefined>(undefined);

  const isWorkbenchRefreshEvent = (msg: SseMessage): boolean => {
    if (msg.event === "ping" || msg.data?.type === "ping") return false;
    const name = String(msg.event ?? msg.data.workbench_event ?? "");
    return name === "task_created" || name === "task_updated" || name === "approval_created";
  };

  const reloadLists = useCallback(async () => {
    if (!config) return;
    const [taskRows, approvalRows, summaryRow] = await Promise.all([
      listTasks(config),
      listPendingApprovals(config),
      getWorkbenchSummary(config),
    ]);
    setTasks(taskRows);
    setPendingApprovals(approvalRows);
    setSummary(summaryRow);
    if (!selectedId && taskRows[0]) {
      setSelectedId(taskRows[0].id);
    }
  }, [config, selectedId]);

  const reloadDetail = useCallback(async () => {
    if (!config || !selectedId) {
      setDetail(null);
      return;
    }
    const row = await getTask(config, selectedId);
    setDetail(row);
  }, [config, selectedId]);

  useEffect(() => {
    if (!config) return;
    void reloadLists();
  }, [config, reloadLists]);

  useEffect(() => {
    if (!config) return;
    void reloadDetail();
  }, [config, reloadDetail]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await window.profileRuntime.listProfiles();
        setProfiles(rows.map((p) => ({ id: p.id, name: p.name })));
      } catch {
        setProfiles([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!config) return;
    const controller = new AbortController();
    let cancelled = false;
    let retries = 0;

    const connectGlobal = async () => {
      while (!cancelled && !controller.signal.aborted) {
        try {
          await subscribeSse(
            config,
            "/api/v1/desktop/task-workbench/events/stream",
            (msg: SseMessage) => {
              if (msg.id) lastGlobalEventIdRef.current = msg.id;
              if (!isWorkbenchRefreshEvent(msg)) return;
              void reloadLists();
              void reloadDetail();
            },
            controller.signal,
            lastGlobalEventIdRef.current,
          );
          retries = 0;
          break;
        } catch {
          if (cancelled || controller.signal.aborted) break;
          if (retries >= 1) break;
          retries += 1;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    };

    void connectGlobal();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [config, reloadLists, reloadDetail]);

  useEffect(() => {
    if (!config || !selectedId) {
      setTimeline([]);
      lastTimelineEventIdRef.current = undefined;
      return;
    }
    lastTimelineEventIdRef.current = undefined;
    const controller = new AbortController();
    let cancelled = false;
    let retries = 0;
    const taskId = selectedId;

    const connectTimeline = async () => {
      while (!cancelled && !controller.signal.aborted) {
        try {
          await subscribeSse(
            config,
            `/api/v1/tasks/${taskId}/events/stream`,
            (msg: SseMessage) => {
              if (msg.event === "ping" || msg.data?.type === "ping") return;
              const record: TaskEventRecord = {
                id: String(msg.data.id ?? msg.id ?? crypto.randomUUID()),
                task_id: String(msg.data.task_id ?? taskId),
                run_id: (msg.data.run_id as string | null | undefined) ?? null,
                event_type: String(msg.event ?? msg.data.event_type ?? "event"),
                message: (msg.data.message as string | null | undefined) ?? null,
                event_payload: (msg.data.event_payload as Record<string, unknown> | null | undefined) ?? null,
                created_at: String(msg.data.created_at ?? new Date().toISOString()),
              };
              setTimeline((prev) => {
                if (prev.some((e) => e.id === record.id)) return prev;
                return [...prev, record];
              });
              if (msg.id) lastTimelineEventIdRef.current = msg.id;
            },
            controller.signal,
            lastTimelineEventIdRef.current,
          );
          retries = 0;
          break;
        } catch {
          if (cancelled || controller.signal.aborted) break;
          if (retries >= 1) break;
          retries += 1;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    };

    void connectTimeline();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [config, selectedId]);

  const pendingForSelected = useMemo(
    () => pendingApprovals.filter((a) => a.task_id === selectedId),
    [pendingApprovals, selectedId],
  );

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reloadLists();
      await reloadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在连接 copilot-serve…</div>;
  }

  if (error || !config) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm">
        <p className="text-destructive">{error ?? "copilot-serve 未就绪"}</p>
        <button type="button" className="rounded border px-3 py-1" onClick={() => void refresh()}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <header className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm">
        <span className="font-medium">Task Workbench</span>
        {summary ? (
          <span className="text-muted-foreground">
            任务 {Object.values(summary.tasks).reduce((a, b) => a + b, 0)} · 待审批{" "}
            {summary.approvals.pending ?? 0}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-2 py-1"
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                await createTask(config, { title: `Task ${new Date().toLocaleTimeString()}` });
              })
            }
          >
            新建任务
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1"
            disabled={busy}
            onClick={() => void runAction(async () => { await pullTeamTasks(config); })}
          >
            Team Hub 拉取
          </button>
        </div>
      </header>

      {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_280px] gap-3">
        <aside className="flex min-h-0 flex-col overflow-auto rounded border">
          {tasks.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">暂无任务</p>
          ) : (
            <ul>
              {tasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-muted ${
                      selectedId === task.id ? "bg-muted font-medium" : ""
                    }`}
                    onClick={() => setSelectedId(task.id)}
                  >
                    <div className="truncate">{task.title}</div>
                    <div className="text-muted-foreground">{task.status}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex min-h-0 flex-col overflow-auto rounded border p-3 text-sm">
          {!detail ? (
            <p className="text-muted-foreground">选择任务查看详情</p>
          ) : (
            <>
              <h2 className="text-base font-semibold">{detail.title}</h2>
              <p className="text-xs text-muted-foreground">状态：{detail.status}</p>
              <p className="text-xs text-muted-foreground">类型：{detail.task_type}</p>
              {detail.error_message ? (
                <p className="mt-2 text-xs text-destructive">{detail.error_message}</p>
              ) : null}

              <label className="mt-3 block text-xs">
                绑定 Profile
                <select
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={detail.target_profile_id ?? ""}
                  onChange={(e) =>
                    void runAction(async () => {
                      if (!e.target.value) return;
                      await bindProfile(config, detail.id, e.target.value);
                    })
                  }
                >
                  <option value="">未绑定</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border px-2 py-1"
                  disabled={busy}
                  onClick={() => void runAction(async () => { await runTask(config, detail.id); })}
                >
                  执行
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1"
                  disabled={busy}
                  onClick={() => void runAction(async () => { await cancelTask(config, detail.id); })}
                >
                  取消
                </button>
              </div>

              {pendingForSelected.length > 0 ? (
                <div className="mt-4 space-y-2 rounded border p-2">
                  <p className="text-xs font-medium">待审批</p>
                  {pendingForSelected.map((ap) => (
                    <div key={ap.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1">{ap.action_type}</span>
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5"
                        onClick={() => void runAction(async () => { await approve(config, ap.id); })}
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5"
                        onClick={() => void runAction(async () => { await reject(config, ap.id); })}
                      >
                        拒绝
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>

        <aside className="flex min-h-0 flex-col overflow-auto rounded border p-2 text-xs">
          <p className="mb-2 font-medium">时间线</p>
          {timeline.length === 0 ? (
            <p className="text-muted-foreground">暂无事件</p>
          ) : (
            <ul className="space-y-2">
              {timeline.map((ev) => (
                <li key={ev.id} className="rounded border p-2">
                  <div className="font-medium">{ev.event_type}</div>
                  {ev.message ? <div>{ev.message}</div> : null}
                  {ev.run_id ? <div className="text-muted-foreground">run: {ev.run_id}</div> : null}
                  <div className="text-muted-foreground">{ev.created_at}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
