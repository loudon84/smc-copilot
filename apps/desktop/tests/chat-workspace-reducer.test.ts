import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetCreatedOrderForTests,
  createChatRunRecord,
  deriveTabTitle,
} from "../src/renderer/src/modules/chat/workspace/ChatRunRecord";
import {
  chatWorkspaceReducer,
  createInitialChatWorkspaceState,
} from "../src/renderer/src/modules/chat/workspace/chatWorkspaceReducer";
import {
  deserializeChatWorkspace,
  serializeChatWorkspace,
} from "../src/renderer/src/modules/chat/workspace/chatWorkspacePersistence";

describe("chatWorkspaceReducer", () => {
  beforeEach(() => {
    __resetCreatedOrderForTests();
  });

  it("openRun stores per-run expert/skill/session/workMode", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: {
        runId: "r1",
        profileId: "default",
        sessionId: "s1",
        mode: "expert",
        expertId: "exp-1",
        expertName: "市场-资料分析",
        skillName: "customer-profiling",
        skillDisplayName: "Customer Profiling",
        permissionMode: "ask_each_time",
        workMode: "plan",
      },
    });
    const run = state.runs[0];
    expect(run.context.expertId).toBe("exp-1");
    expect(run.context.skillName).toBe("customer-profiling");
    expect(run.context.workMode).toBe("plan");
    expect(run.context.permissionMode).toBe("ask_each_time");
    expect(run.identity.sessionId).toBe("s1");
    expect(state.activeRunId).toBe("r1");
  });

  it("keeps createdOrder stable and does not reorder by updatedAt", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "a", profileId: "default" },
    });
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "b", profileId: "default" },
    });
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "c", profileId: "default" },
    });
    state = chatWorkspaceReducer(state, {
      type: "patchRun",
      runId: "a",
      patch: { presentation: { draft: "later" } },
    });
    expect(state.runs.map((r) => r.runId)).toEqual(["a", "b", "c"]);
  });

  it("returnDefault clears only the targeted run", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: {
        runId: "r1",
        profileId: "default",
        expertId: "e1",
        expertName: "E1",
        skillName: "sk1",
        mode: "expert",
      },
    });
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: {
        runId: "r2",
        profileId: "default",
        expertId: "e2",
        expertName: "E2",
        skillName: "sk2",
        mode: "expert",
      },
    });
    state = chatWorkspaceReducer(state, { type: "returnDefault", runId: "r1" });
    const r1 = state.runs.find((r) => r.runId === "r1")!;
    const r2 = state.runs.find((r) => r.runId === "r2")!;
    expect(r1.context.mode).toBe("default");
    expect(r1.context.expertId).toBeUndefined();
    expect(r1.context.skillName).toBeUndefined();
    expect(r2.context.expertId).toBe("e2");
    expect(r2.context.skillName).toBe("sk2");
  });

  it("patchRun deep-merges identity.sessionId without wiping profile", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "r1", profileId: "writer" },
    });
    state = chatWorkspaceReducer(state, {
      type: "patchRun",
      runId: "r1",
      patch: { identity: { sessionId: "sess-9" } },
    });
    const run = state.runs[0];
    expect(run.identity.sessionId).toBe("sess-9");
    expect(run.identity.profileId).toBe("writer");
  });

  it("markInterrupted only affects busy runs", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "busy", profileId: "default" },
    });
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "idle", profileId: "default" },
    });
    state = chatWorkspaceReducer(state, {
      type: "patchRun",
      runId: "busy",
      patch: { execution: { runState: "streaming" } },
    });
    state = chatWorkspaceReducer(state, {
      type: "markInterrupted",
      runId: "busy",
    });
    state = chatWorkspaceReducer(state, {
      type: "markInterrupted",
      runId: "idle",
    });
    expect(state.runs.find((r) => r.runId === "busy")!.execution.runState).toBe(
      "interrupted",
    );
    expect(state.runs.find((r) => r.runId === "idle")!.execution.runState).toBe(
      "idle",
    );
  });
});

describe("multi-run isolation", () => {
  beforeEach(() => {
    __resetCreatedOrderForTests();
  });

  it("keeps expertId/sessionId/draft independent across runs", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: {
        runId: "a",
        profileId: "default",
        expertId: "ea",
        expertName: "EA",
        sessionId: "sa",
      },
    });
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: {
        runId: "b",
        profileId: "default",
        expertId: "eb",
        expertName: "EB",
        sessionId: "sb",
      },
    });
    state = chatWorkspaceReducer(state, {
      type: "patchRun",
      runId: "a",
      patch: { presentation: { draft: "draft-a" } },
    });
    state = chatWorkspaceReducer(state, {
      type: "patchRun",
      runId: "b",
      patch: {
        identity: { sessionId: "sb-2" },
        presentation: { draft: "draft-b" },
      },
    });
    const a = state.runs.find((r) => r.runId === "a")!;
    const b = state.runs.find((r) => r.runId === "b")!;
    expect(a.context.expertId).toBe("ea");
    expect(a.identity.sessionId).toBe("sa");
    expect(a.presentation.draft).toBe("draft-a");
    expect(b.context.expertId).toBe("eb");
    expect(b.identity.sessionId).toBe("sb-2");
    expect(b.presentation.draft).toBe("draft-b");
  });
});

describe("title derivation", () => {
  it("prefers user title over session and first prompt", () => {
    const current = createChatRunRecord({
      runId: "r",
      title: "My Title",
    }).presentation;
    // force user source
    current.titleSource = "user";
    const out = deriveTabTitle({
      current,
      sessionTitle: "Session Title",
      firstUserPrompt: "Hello world",
    });
    expect(out.title).toBe("My Title");
    expect(out.titleSource).toBe("user");
  });

  it("uses first prompt when placeholder and no session title", () => {
    const current = createChatRunRecord({ runId: "r" }).presentation;
    const out = deriveTabTitle({
      current,
      firstUserPrompt: "Analyze customer profiles for Q3 campaign",
    });
    expect(out.titleSource).toBe("first_prompt");
    expect(out.title).toBe("Analyze customer profiles for Q3 campaign".slice(0, 40));
    expect(out.title).not.toContain("customer-profiling");
  });

  it("does not use skill name as title", () => {
    const run = createChatRunRecord({
      runId: "r",
      skillName: "customer-profiling",
      expertName: "市场",
    });
    expect(run.presentation.title).toBe("New Chat");
    expect(run.presentation.title).not.toBe("customer-profiling");
  });
});

describe("run-state feedback", () => {
  beforeEach(() => {
    __resetCreatedOrderForTests();
  });

  it("marks background run unread on completion", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "bg", profileId: "default" },
    });
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "fg", profileId: "default" },
    });
    state = chatWorkspaceReducer(state, {
      type: "patchRun",
      runId: "bg",
      patch: { execution: { runState: "streaming" } },
    });
    state = chatWorkspaceReducer(state, {
      type: "applyControllerSnapshot",
      runId: "bg",
      active: false,
      snapshot: {
        sessionId: "s-bg",
        runState: "completed",
        selectedModelId: "m1",
        firstUserPrompt: "Background prompt about markets",
      },
    });
    const bg = state.runs.find((r) => r.runId === "bg")!;
    expect(bg.presentation.unread).toBe(true);
    expect(bg.execution.runState).toBe("completed");
    expect(bg.presentation.titleSource).toBe("first_prompt");
    expect(bg.identity.sessionId).toBe("s-bg");
  });

  it("clears unread when active", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: { runId: "r1", profileId: "default" },
    });
    state = chatWorkspaceReducer(state, {
      type: "markUnread",
      runId: "r1",
      unread: true,
    });
    state = chatWorkspaceReducer(state, {
      type: "applyControllerSnapshot",
      runId: "r1",
      active: true,
      snapshot: {
        sessionId: null,
        runState: "idle",
        selectedModelId: null,
      },
    });
    expect(state.runs[0].presentation.unread).toBe(false);
  });
});

describe("workspace persistence", () => {
  beforeEach(() => {
    __resetCreatedOrderForTests();
  });

  it("round-trips metadata and marks busy runs interrupted", () => {
    let state = createInitialChatWorkspaceState();
    state = chatWorkspaceReducer(state, {
      type: "openRun",
      input: {
        runId: "r1",
        profileId: "default",
        expertId: "e1",
        expertName: "Expert",
        skillName: "sk",
        workMode: "craft",
      },
    });
    state = chatWorkspaceReducer(state, {
      type: "patchRun",
      runId: "r1",
      patch: {
        execution: { runState: "streaming" },
        presentation: { draft: "hello", title: "Hello", titleSource: "first_prompt" },
      },
    });
    const serialized = serializeChatWorkspace(state);
    const restored = deserializeChatWorkspace(serialized)!;
    expect(restored.runs).toHaveLength(1);
    expect(restored.runs[0].context.expertId).toBe("e1");
    expect(restored.runs[0].context.workMode).toBe("craft");
    expect(restored.runs[0].presentation.draft).toBe("hello");
    expect(restored.runs[0].execution.runState).toBe("interrupted");
  });
});
