/**
 * Chat workspace reducer — manages ChatRunRecord[] with stable createdOrder.
 */

import {
  createChatRunRecord,
  returnRunToDefault,
  type ChatRunRecord,
  type DeepPartial,
  type OpenChatRunInput,
} from "./ChatRunRecord";

export type ChatWorkspaceState = {
  runs: ChatRunRecord[];
  activeRunId: string | null;
};

export type ChatWorkspaceAction =
  | { type: "restore"; state: ChatWorkspaceState }
  | { type: "openRun"; input: OpenChatRunInput; activate?: boolean }
  | { type: "closeRun"; runId: string }
  | { type: "setActive"; runId: string | null }
  | { type: "patchRun"; runId: string; patch: DeepPartial<ChatRunRecord> }
  | { type: "renameRun"; runId: string; title: string }
  | { type: "markUnread"; runId: string; unread?: boolean }
  | { type: "markInterrupted"; runId: string }
  | { type: "returnDefault"; runId: string }
  | {
      type: "applyControllerSnapshot";
      runId: string;
      active: boolean;
      snapshot: {
        sessionId: string | null;
        runState: ChatRunRecord["execution"]["runState"];
        selectedModelId: string | null;
        firstUserPrompt?: string;
        sessionTitle?: string | null;
      };
    };

export function createInitialChatWorkspaceState(
  seed?: Partial<ChatWorkspaceState>,
): ChatWorkspaceState {
  return {
    runs: seed?.runs ?? [],
    activeRunId: seed?.activeRunId ?? null,
  };
}

function deepMerge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as T;
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const patchVal = patch[key];
    if (patchVal === undefined) {
      // Explicit undefined clears optional fields on leaf objects.
      (out as Record<string, unknown>)[key as string] = undefined;
      continue;
    }
    const baseVal = base[key];
    if (
      patchVal !== null &&
      typeof patchVal === "object" &&
      !Array.isArray(patchVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      (out as Record<string, unknown>)[key as string] = deepMerge(
        baseVal as object,
        patchVal as DeepPartial<object>,
      );
    } else {
      (out as Record<string, unknown>)[key as string] = patchVal;
    }
  }
  return out;
}

function touch(run: ChatRunRecord): ChatRunRecord {
  return {
    ...run,
    identity: { ...run.identity, updatedAt: Date.now() },
  };
}

function sortByCreatedOrder(runs: ChatRunRecord[]): ChatRunRecord[] {
  return [...runs].sort(
    (a, b) => a.identity.createdOrder - b.identity.createdOrder,
  );
}

function isBusy(
  runState: ChatRunRecord["execution"]["runState"],
): boolean {
  return (
    runState === "creating" ||
    runState === "streaming" ||
    runState === "waiting_approval" ||
    runState === "waiting_clarify"
  );
}

function deriveTitleFromSnapshot(
  run: ChatRunRecord,
  snapshot: {
    firstUserPrompt?: string;
    sessionTitle?: string | null;
  },
): Pick<ChatRunRecord["presentation"], "title" | "titleSource"> {
  if (run.presentation.titleSource === "user") {
    return {
      title: run.presentation.title,
      titleSource: "user",
    };
  }
  if (snapshot.sessionTitle?.trim()) {
    return {
      title: snapshot.sessionTitle.trim().slice(0, 40),
      titleSource: "session",
    };
  }
  if (
    run.presentation.titleSource === "placeholder" ||
    run.presentation.titleSource === "first_prompt"
  ) {
    const prompt = snapshot.firstUserPrompt?.trim();
    if (prompt) {
      return {
        title: prompt.slice(0, 40),
        titleSource: "first_prompt",
      };
    }
  }
  return {
    title: run.presentation.title,
    titleSource: run.presentation.titleSource,
  };
}

export function chatWorkspaceReducer(
  state: ChatWorkspaceState,
  action: ChatWorkspaceAction,
): ChatWorkspaceState {
  switch (action.type) {
    case "restore":
      return {
        runs: sortByCreatedOrder(action.state.runs),
        activeRunId: action.state.activeRunId,
      };

    case "openRun": {
      const existing = state.runs.find((r) => r.runId === action.input.runId);
      if (existing) {
        return {
          ...state,
          activeRunId:
            action.activate === false ? state.activeRunId : action.input.runId,
        };
      }
      const record = createChatRunRecord(action.input);
      return {
        runs: sortByCreatedOrder([...state.runs, record]),
        activeRunId:
          action.activate === false ? state.activeRunId : record.runId,
      };
    }

    case "closeRun": {
      const runs = state.runs.filter((r) => r.runId !== action.runId);
      let activeRunId = state.activeRunId;
      if (activeRunId === action.runId) {
        activeRunId = runs.length > 0 ? runs[runs.length - 1].runId : null;
      }
      return { runs, activeRunId };
    }

    case "setActive":
      return { ...state, activeRunId: action.runId };

    case "patchRun": {
      const runs = state.runs.map((run) => {
        if (run.runId !== action.runId) return run;
        const merged = deepMerge(run, action.patch);
        return touch(merged);
      });
      return { ...state, runs };
    }

    case "renameRun": {
      const title = action.title.trim().slice(0, 80) || "New Chat";
      const runs = state.runs.map((run) => {
        if (run.runId !== action.runId) return run;
        return touch({
          ...run,
          presentation: {
            ...run.presentation,
            title,
            titleSource: "user",
          },
        });
      });
      return { ...state, runs };
    }

    case "markUnread": {
      const unread = action.unread ?? true;
      const runs = state.runs.map((run) => {
        if (run.runId !== action.runId) return run;
        return touch({
          ...run,
          presentation: { ...run.presentation, unread },
        });
      });
      return { ...state, runs };
    }

    case "markInterrupted": {
      const runs = state.runs.map((run) => {
        if (run.runId !== action.runId) return run;
        if (!isBusy(run.execution.runState)) return run;
        return touch({
          ...run,
          execution: {
            ...run.execution,
            runState: "interrupted",
            completedAt: Date.now(),
          },
        });
      });
      return { ...state, runs };
    }

    case "returnDefault": {
      const runs = state.runs.map((run) => {
        if (run.runId !== action.runId) return run;
        const cleared = returnRunToDefault(run);
        return touch({
          ...run,
          context: {
            mode: "default",
            permissionMode: "default",
            workMode: run.context.workMode,
          },
          execution: {
            ...run.execution,
            expertRunId: undefined,
            invocationSource: "default_chat",
          },
          // apply cleared presentation if any
          presentation: deepMerge(run.presentation, cleared.presentation ?? {}),
        });
      });
      return { ...state, runs };
    }

    case "applyControllerSnapshot": {
      const runs = state.runs.map((run) => {
        if (run.runId !== action.runId) return run;
        const prevState = run.execution.runState;
        const nextState = action.snapshot.runState;
        const titleBits = deriveTitleFromSnapshot(run, action.snapshot);

        let unread = run.presentation.unread;
        if (action.active) {
          unread = false;
        } else if (
          isBusy(prevState) &&
          (nextState === "completed" ||
            nextState === "failed" ||
            nextState === "cancelled")
        ) {
          unread = true;
        }

        const nextSessionId = action.snapshot.sessionId;
        const nextModelId =
          action.snapshot.selectedModelId ?? run.presentation.selectedModelId;

        const unchanged =
          prevState === nextState &&
          run.identity.sessionId === nextSessionId &&
          run.presentation.selectedModelId === nextModelId &&
          run.presentation.title === titleBits.title &&
          run.presentation.titleSource === titleBits.titleSource &&
          run.presentation.unread === unread;

        if (unchanged) return run;

        const startedAt =
          run.execution.startedAt ??
          (isBusy(nextState) ? Date.now() : undefined);
        const completedAt =
          nextState === "completed" ||
          nextState === "failed" ||
          nextState === "cancelled"
            ? run.execution.completedAt ?? Date.now()
            : run.execution.completedAt;

        return touch({
          ...run,
          identity: {
            ...run.identity,
            sessionId: nextSessionId,
            updatedAt: Date.now(),
          },
          execution: {
            ...run.execution,
            runState: nextState,
            startedAt,
            completedAt,
          },
          presentation: {
            ...run.presentation,
            title: titleBits.title,
            titleSource: titleBits.titleSource,
            unread,
            selectedModelId: nextModelId,
          },
        });
      });
      return { ...state, runs };
    }

    default:
      return state;
  }
}

export function getRunById(
  state: ChatWorkspaceState,
  runId: string | null | undefined,
): ChatRunRecord | undefined {
  if (!runId) return undefined;
  return state.runs.find((r) => r.runId === runId);
}
