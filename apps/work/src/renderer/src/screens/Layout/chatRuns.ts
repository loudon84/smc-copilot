import type { ChatMessage } from "../Chat/Chat";

export type ChatExecutionMode = "local-chat" | "skill-run" | "remote-expert";

/**
 * One concurrently-running (or open) conversation. Several runs coexist so the
 * user can background a session — or a whole agent/profile — and return to it
 * live. `runId` is minted in the renderer and threaded through the main process
 * so streaming events route back to the right run.
 */
export interface ChatRun {
  runId: string;
  /** Immutable: the profile/agent this run was started under. */
  profile: string;
  /** Execution mode: standard local chat vs skill run */
  executionMode?: ChatExecutionMode;
  /**
   * Scratch-only Remote Expert target agent_ref (Layout-owned).
   * MUST be undefined unless executionMode === "remote-expert".
   * After ACP session exists, durable binding wins over this field.
   */
  remoteExpertAgentRef?: string;
  /** Gateway session id, known once the first turn reports it. */
  sessionId: string | null;
  /** True while the agent is generating for this run. */
  loading: boolean;
  /** Best-effort title (first user message) for the active-sessions bar. */
  title?: string;
  /** Seed transcript when the run was opened from history. */
  seed?: ChatMessage[];
}

export type RemoteExpertSelectTarget =
  | { kind: "remote"; agentRef: string }
  | { kind: "local" };

export type RemoteExpertModeTransitionResult =
  | { kind: "noop"; activeRunId: string; runs: ChatRun[] }
  | { kind: "in-place"; activeRunId: string; runs: ChatRun[] }
  | {
      kind: "requires-confirm";
      activeRunId: string;
      runs: ChatRun[];
      confirmKey: "chat.remoteExpert.confirmNewChat" | "chat.remoteExpert.confirmChangeContext";
    }
  | {
      kind: "invalid";
      activeRunId: string;
      runs: ChatRun[];
      errorCode: "REMOTE_EXPERT_RUN_TRANSITION_INVALID";
    };

/** A blank chat that can be reassigned to another profile/mode without losing work. */
export function isScratchRun(
  r: ChatRun,
  mode?: ChatExecutionMode,
): boolean {
  const rMode = r.executionMode ?? "local-chat";
  // Remote Expert mints desktop sessionId at run create; scratch is still
  // "no title / not loading" until the first turn binds transcript.
  const isBlank =
    rMode === "remote-expert"
      ? !r.loading && !r.title
      : !r.sessionId && !r.loading && !r.title;
  if (!isBlank) return false;
  if (mode !== undefined) {
    return rMode === mode;
  }
  return true;
}

function mintDesktopSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Mint a fresh, empty run under the given profile. */
export function mintRun(
  profile: string,
  seed?: ChatMessage[],
  executionMode?: ChatExecutionMode,
  remoteExpertAgentRef?: string,
): ChatRun {
  const mode = executionMode ?? "local-chat";
  const next: ChatRun = {
    runId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `run-${crypto.randomUUID()}`
        : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    profile,
    executionMode: mode,
    // Remote Expert: sessionId is the durable desktop ACP session id (mint at create).
    // Local/Hermes: sessionId stays null until the gateway reports one.
    sessionId: mode === "remote-expert" ? mintDesktopSessionId() : null,
    loading: false,
    seed,
  };
  if (mode === "remote-expert") {
    next.remoteExpertAgentRef = remoteExpertAgentRef;
  }
  return next;
}

/** Immutably patch one run's fields by id. */
export function patchRun(
  runs: ChatRun[],
  runId: string,
  patch: Partial<ChatRun>,
): ChatRun[] {
  return runs.map((r) => (r.runId === runId ? { ...r, ...patch } : r));
}

/**
 * Keep the selected shell profile and the visible chat run in sync.
 *
 * Existing conversations remain under the profile they started with; switching
 * profiles activates a scratch run for the new profile instead of showing a
 * stale conversation from the previous one.
 */
export function selectProfileRunTransition(
  runs: ChatRun[],
  activeRunId: string,
  profile: string,
): { activeRunId: string; runs: ChatRun[] } {
  const active = runs.find((r) => r.runId === activeRunId);
  if (!active || active.profile === profile) {
    return { activeRunId, runs };
  }

  const activeMode = active.executionMode ?? "local-chat";

  if (isScratchRun(active, activeMode)) {
    return {
      activeRunId,
      runs: runs.map((r) => (r.runId === activeRunId ? { ...r, profile } : r)),
    };
  }

  const scratch = runs.find(
    (r) => r.profile === profile && isScratchRun(r, activeMode),
  );
  if (scratch) {
    return { activeRunId: scratch.runId, runs };
  }

  const next = mintRun(profile, undefined, activeMode);
  return { activeRunId: next.runId, runs: [...runs, next] };
}

/**
 * Open a persisted session without leaving behind the active blank placeholder.
 *
 * Profile switching may create a scratch run so the visible chat matches the
 * selected profile. If the next action is opening a saved session for that same
 * profile, the saved session should occupy that placeholder tab.
 */
export function openSessionRunTransition(
  runs: ChatRun[],
  activeRunId: string,
  run: ChatRun,
): { activeRunId: string; runs: ChatRun[] } {
  const active = runs.find((r) => r.runId === activeRunId);
  if (active && active.profile === run.profile && isScratchRun(active)) {
    return {
      activeRunId: run.runId,
      runs: runs.map((r) => (r.runId === activeRunId ? run : r)),
    };
  }

  return { activeRunId: run.runId, runs: [...runs, run] };
}

/**
 * Chrome-style tab cycling: the run `delta` steps away from the active one,
 * wrapping at both ends. Returns null when there is nothing to switch to.
 */
export function cycleRunId(
  runs: ChatRun[],
  activeRunId: string,
  delta: 1 | -1,
): string | null {
  if (runs.length < 2) return null;
  const idx = runs.findIndex((r) => r.runId === activeRunId);
  if (idx === -1) return runs[0].runId;
  return runs[(idx + delta + runs.length) % runs.length].runId;
}

/**
 * Chrome-style ordinal jump: Cmd/Ctrl+1..8 select the Nth tab, 9 selects the
 * last tab regardless of count. Returns null when the ordinal has no tab.
 */
export function runIdAtOrdinal(
  runs: ChatRun[],
  ordinal: number,
): string | null {
  if (runs.length === 0) return null;
  if (ordinal === 9) return runs[runs.length - 1].runId;
  const idx = ordinal - 1;
  return idx >= 0 && idx < runs.length ? runs[idx].runId : null;
}

/** The first live run already bound to a given gateway session id, if any. */
export function findRunBySession(
  runs: ChatRun[],
  sessionId: string,
): ChatRun | undefined {
  return runs.find((r) => r.sessionId === sessionId);
}

/**
 * Apply Layout "使用技能" navigation: stay on skill scratch, convert blank scratch
 * in-place, or reuse/mint a profile skill scratch without aborting other tabs.
 */
export function selectSkillModeTransition(
  runs: ChatRun[],
  activeRunId: string,
  profile: string,
): { activeRunId: string; runs: ChatRun[] } {
  const active = runs.find((r) => r.runId === activeRunId);
  if (active) {
    if (active.executionMode === "skill-run" && isScratchRun(active, "skill-run")) {
      return { activeRunId, runs };
    }
    if (isScratchRun(active)) {
      return {
        activeRunId,
        runs: runs.map((r) =>
          r.runId === active.runId
            ? {
                ...r,
                executionMode: "skill-run" as const,
                remoteExpertAgentRef: undefined,
              }
            : r,
        ),
      };
    }
  }

  const existingSkillScratch = runs.find(
    (r) => r.profile === profile && isScratchRun(r, "skill-run"),
  );
  if (existingSkillScratch) {
    return { activeRunId: existingSkillScratch.runId, runs };
  }

  const next = mintRun(profile, undefined, "skill-run");
  return { activeRunId: next.runId, runs: [...runs, next] };
}

function stripRemoteAgentRef(run: ChatRun): ChatRun {
  if (run.remoteExpertAgentRef === undefined) return run;
  const { remoteExpertAgentRef: _drop, ...rest } = run;
  return rest;
}

function asRemoteScratch(run: ChatRun, agentRef: string | undefined): ChatRun {
  // Mode switch must not reuse a Local/Hermes gateway id as desktop ACP id.
  return {
    ...run,
    executionMode: "remote-expert",
    remoteExpertAgentRef: agentRef,
    sessionId: mintDesktopSessionId(),
  };
}

function asLocalScratch(run: ChatRun): ChatRun {
  return stripRemoteAgentRef({
    ...run,
    executionMode: "local-chat",
    // Local path will mint/receive a gateway session id on first send.
    sessionId: null,
  });
}

function findMatchingRemoteScratch(
  runs: ChatRun[],
  profile: string,
  agentRef: string | undefined,
): ChatRun | undefined {
  return runs.find(
    (r) =>
      r.profile === profile &&
      isScratchRun(r, "remote-expert") &&
      (r.remoteExpertAgentRef ?? undefined) === (agentRef ?? undefined),
  );
}

/**
 * Layout-owned Remote Expert selection transition (PRD REQ-STATE-002 / REQ-UI-002).
 * Bound runs never mutate context in place; they return requires-confirm with a
 * computed next scratch state for the caller to commit after user confirmation.
 */
export function selectRemoteExpertModeTransition(
  runs: ChatRun[],
  activeRunId: string,
  profile: string,
  target: RemoteExpertSelectTarget,
  options?: { hasTranscript?: boolean },
): RemoteExpertModeTransitionResult {
  const active = runs.find((r) => r.runId === activeRunId);
  if (!active) {
    return {
      kind: "invalid",
      activeRunId,
      runs,
      errorCode: "REMOTE_EXPERT_RUN_TRANSITION_INVALID",
    };
  }

  const mode = active.executionMode ?? "local-chat";
  // Transcript in Chat state counts as bound even before title/sessionId land.
  const scratch =
    isScratchRun(active) &&
    !(options?.hasTranscript === true) &&
    !(active.seed && active.seed.length > 0);

  if (target.kind === "local") {
    if (mode === "local-chat" && scratch) {
      return { kind: "noop", activeRunId, runs };
    }
    if (scratch) {
      return {
        kind: "in-place",
        activeRunId,
        runs: runs.map((r) =>
          r.runId === activeRunId ? asLocalScratch(r) : r,
        ),
      };
    }
    const existingLocal = runs.find(
      (r) => r.profile === profile && isScratchRun(r, "local-chat"),
    );
    if (existingLocal) {
      return {
        kind: "requires-confirm",
        activeRunId: existingLocal.runId,
        runs,
        confirmKey:
          mode === "remote-expert"
            ? "chat.remoteExpert.confirmChangeContext"
            : "chat.remoteExpert.confirmNewChat",
      };
    }
    const next = mintRun(profile, undefined, "local-chat");
    return {
      kind: "requires-confirm",
      activeRunId: next.runId,
      runs: [...runs, next],
      confirmKey:
        mode === "remote-expert"
          ? "chat.remoteExpert.confirmChangeContext"
          : "chat.remoteExpert.confirmNewChat",
    };
  }

  const agentRef = target.agentRef.trim();
  if (!agentRef) {
    return {
      kind: "invalid",
      activeRunId,
      runs,
      errorCode: "REMOTE_EXPERT_RUN_TRANSITION_INVALID",
    };
  }

  if (
    scratch &&
    mode === "remote-expert" &&
    active.remoteExpertAgentRef === agentRef
  ) {
    return { kind: "noop", activeRunId, runs };
  }

  if (scratch) {
    return {
      kind: "in-place",
      activeRunId,
      runs: runs.map((r) =>
        r.runId === activeRunId ? asRemoteScratch(r, agentRef) : r,
      ),
    };
  }

  const existing = findMatchingRemoteScratch(runs, profile, agentRef);
  if (existing) {
    return {
      kind: "requires-confirm",
      activeRunId: existing.runId,
      runs,
      confirmKey:
        mode === "remote-expert"
          ? "chat.remoteExpert.confirmChangeContext"
          : "chat.remoteExpert.confirmNewChat",
    };
  }
  const next = mintRun(profile, undefined, "remote-expert", agentRef);
  return {
    kind: "requires-confirm",
    activeRunId: next.runId,
    runs: [...runs, next],
    confirmKey:
      mode === "remote-expert"
        ? "chat.remoteExpert.confirmChangeContext"
        : "chat.remoteExpert.confirmNewChat",
  };
}

/** Clear scratch agent_ref while keeping remote-expert mode (catalog refresh miss). */
export function clearRemoteExpertScratchSelection(
  runs: ChatRun[],
  runId: string,
): ChatRun[] {
  return runs.map((r) => {
    if (r.runId !== runId) return r;
    if ((r.executionMode ?? "local-chat") !== "remote-expert") return r;
    if (r.sessionId) return r;
    return { ...r, remoteExpertAgentRef: undefined };
  });
}

/** Session ids of every currently-loading run (for sidebar spinners). */
export function loadingSessionIds(runs: ChatRun[]): Set<string> {
  const ids = new Set<string>();
  for (const r of runs) {
    if (r.loading && r.sessionId) ids.add(r.sessionId);
  }
  return ids;
}

/** Sidebar / Sessions modal payload when opening a saved conversation. */
export interface ResumeSessionTarget {
  sessionId: string;
  title?: string;
  sessionKind?: "chat" | "work" | "kb-set";
  executionProvider?: "hermes-chat" | "skill-run" | "remote-expert-acp";
}

/**
 * Prefer an explicit history pair from the sidebar; skill-run IPC may still
 * override the display title after the fact.
 * kb-set sessions MUST NOT resume into ordinary Layout Chat (PRD G3).
 */
export function resolveResumeExecutionMode(
  target: ResumeSessionTarget,
  skillRunMode?: {
    executionMode?: string;
    toolTitle?: string;
  } | null,
): { executionMode: ChatExecutionMode; title?: string; rejected?: "kb-set" } {
  if (target.sessionKind === "kb-set") {
    return { executionMode: "local-chat", rejected: "kb-set" };
  }
  const fromPair =
    target.sessionKind === "work" && target.executionProvider === "skill-run"
      ? ("skill-run" as const)
      : target.sessionKind === "chat" &&
          target.executionProvider === "remote-expert-acp"
        ? ("remote-expert" as const)
        : ("local-chat" as const);
  const executionMode =
    skillRunMode?.executionMode === "skill-run" ? "skill-run" : fromPair;
  const skillTitle = skillRunMode?.toolTitle?.trim();
  const sidebarTitle = target.title?.trim();
  return {
    executionMode,
    title:
      executionMode === "skill-run" && skillTitle
        ? skillTitle
        : sidebarTitle || undefined,
  };
}

/** Mint a run bound to a persisted session id, carrying sidebar title + seed. */
export function buildResumedChatRun(
  profile: string,
  target: ResumeSessionTarget,
  seed: ChatMessage[],
  options?: {
    executionMode?: ChatExecutionMode;
    title?: string;
    remoteExpertAgentRef?: string;
  },
): ChatRun {
  const executionMode = options?.executionMode ?? "local-chat";
  const run = mintRun(profile, seed, executionMode);
  run.sessionId = target.sessionId;
  const title = options?.title?.trim() || target.title?.trim();
  if (title) run.title = title;
  // Resume must restore the durable expert binding; otherwise the UI falls
  // back to local-chat display and submit uses a missing scratch ref.
  if (executionMode === "remote-expert" && options?.remoteExpertAgentRef) {
    run.remoteExpertAgentRef = options.remoteExpertAgentRef;
  }
  return run;
}

/**
 * Load transcript rows; when the first read is empty, run `onEmpty` once
 * (typically a session-cache sync) and retry. Covers locally-materialized
 * sidebar rows racing gateway state.db writes.
 */
export async function fetchWithEmptyRetry<T>(
  load: () => Promise<T[]>,
  onEmpty: () => Promise<void>,
): Promise<T[]> {
  let items = await load();
  if (items.length === 0) {
    await onEmpty();
    items = await load();
  }
  return items;
}
