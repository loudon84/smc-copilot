/**
 * Per-run workspace record (v8.0.3).
 * Single source of truth for Session / Expert / Skill / Model / WorkMode per Chat Run.
 */

export type ChatRunMode = "default" | "expert" | "team";

export type ChatWorkMode = "ask" | "plan" | "craft";

export type ChatPermissionMode = "default" | "ask_each_time";

export type ChatInvocationSource =
  | "default_chat"
  | "expert_chat"
  | "team_chat";

export type ChatRunExecutionState =
  | "idle"
  | "creating"
  | "streaming"
  | "waiting_approval"
  | "waiting_clarify"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type ChatTitleSource =
  | "placeholder"
  | "first_prompt"
  | "session"
  | "generated"
  | "user";

export type PromptHintState = {
  mode: "auto" | "custom" | "disabled";
  customValue?: string;
};

export type ChatRunIdentity = {
  sessionId: string | null;
  profileId: string;
  createdAt: number;
  updatedAt: number;
  /** Stable insertion order — never reorder by updatedAt. */
  createdOrder: number;
};

export type ChatRunContext = {
  mode: ChatRunMode;
  expertId?: string;
  expertName?: string;
  teamId?: string;
  teamName?: string;
  skillName?: string;
  skillDisplayName?: string;
  permissionMode: ChatPermissionMode;
  workMode: ChatWorkMode;
};

export type ChatRunExecution = {
  expertRunId?: string;
  invocationSource: ChatInvocationSource;
  runState: ChatRunExecutionState;
  startedAt?: number;
  completedAt?: number;
};

export type ChatRunPresentation = {
  title: string;
  titleSource: ChatTitleSource;
  unread: boolean;
  selectedModelId?: string;
  sessionFilesVisible: boolean;
  previewFileId?: string;
  previewMaximized: boolean;
  draft?: string;
  promptHint?: PromptHintState;
};

export type ChatRunRecord = {
  runId: string;
  identity: ChatRunIdentity;
  context: ChatRunContext;
  execution: ChatRunExecution;
  presentation: ChatRunPresentation;
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? T[K] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : DeepPartial<T[K]>
    : T[K];
};

export type OpenChatRunInput = {
  runId: string;
  profileId?: string;
  sessionId?: string | null;
  title?: string;
  mode?: ChatRunMode;
  expertId?: string;
  expertName?: string;
  teamId?: string;
  teamName?: string;
  skillName?: string;
  skillDisplayName?: string;
  permissionMode?: ChatPermissionMode;
  workMode?: ChatWorkMode;
  expertRunId?: string;
  invocationSource?: ChatInvocationSource;
  selectedModelId?: string;
};

let createdOrderSeq = 0;

export function nextCreatedOrder(): number {
  createdOrderSeq += 1;
  return createdOrderSeq;
}

/** Advance sequence so restored runs keep stable createdOrder. */
export function ensureCreatedOrderAtLeast(min: number): void {
  if (createdOrderSeq < min) createdOrderSeq = min;
}

/** Test helper — reset created-order counter. */
export function __resetCreatedOrderForTests(): void {
  createdOrderSeq = 0;
}

export function createChatRunRecord(input: OpenChatRunInput): ChatRunRecord {
  const now = Date.now();
  const mode = input.mode ?? (input.expertId ? "expert" : input.teamId ? "team" : "default");
  const invocationSource =
    input.invocationSource ??
    (mode === "expert"
      ? "expert_chat"
      : mode === "team"
        ? "team_chat"
        : "default_chat");

  return {
    runId: input.runId,
    identity: {
      sessionId: input.sessionId ?? null,
      profileId: input.profileId || "default",
      createdAt: now,
      updatedAt: now,
      createdOrder: nextCreatedOrder(),
    },
    context: {
      mode,
      expertId: input.expertId,
      expertName: input.expertName,
      teamId: input.teamId,
      teamName: input.teamName,
      skillName: input.skillName,
      skillDisplayName: input.skillDisplayName,
      permissionMode: input.permissionMode ?? "default",
      workMode: input.workMode ?? "ask",
    },
    execution: {
      expertRunId: input.expertRunId,
      invocationSource,
      runState: "idle",
    },
    presentation: {
      title: input.title || "New Chat",
      titleSource: input.title ? "user" : "placeholder",
      unread: false,
      selectedModelId: input.selectedModelId,
      sessionFilesVisible: false,
      previewMaximized: false,
      promptHint: { mode: "auto" },
    },
  };
}

export function isRunBusy(runState: ChatRunExecutionState): boolean {
  return (
    runState === "creating" ||
    runState === "streaming" ||
    runState === "waiting_approval" ||
    runState === "waiting_clarify"
  );
}

export function deriveTabTitle(params: {
  current: ChatRunPresentation;
  sessionTitle?: string | null;
  firstUserPrompt?: string | null;
}): { title: string; titleSource: ChatTitleSource } {
  const { current, sessionTitle, firstUserPrompt } = params;
  if (current.titleSource === "user" && current.title.trim()) {
    return { title: current.title, titleSource: "user" };
  }
  if (sessionTitle && sessionTitle.trim()) {
    return { title: sessionTitle.trim().slice(0, 40), titleSource: "session" };
  }
  if (current.titleSource === "generated" && current.title.trim()) {
    return { title: current.title, titleSource: "generated" };
  }
  if (firstUserPrompt && firstUserPrompt.trim()) {
    return {
      title: firstUserPrompt.trim().slice(0, 40),
      titleSource: "first_prompt",
    };
  }
  if (current.titleSource === "first_prompt" && current.title.trim()) {
    return { title: current.title, titleSource: "first_prompt" };
  }
  return { title: "New Chat", titleSource: "placeholder" };
}

export function returnRunToDefault(
  run: ChatRunRecord,
): DeepPartial<ChatRunRecord> {
  return {
    context: {
      mode: "default",
      expertId: undefined,
      expertName: undefined,
      teamId: undefined,
      teamName: undefined,
      skillName: undefined,
      skillDisplayName: undefined,
      permissionMode: "default",
      workMode: run.context.workMode,
    },
    execution: {
      expertRunId: undefined,
      invocationSource: "default_chat",
    },
  };
}
