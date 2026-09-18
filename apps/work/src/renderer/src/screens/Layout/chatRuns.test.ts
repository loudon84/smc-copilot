import { describe, expect, it, vi } from "vitest";
import {
  buildResumedChatRun,
  cycleRunId,
  fetchWithEmptyRetry,
  isScratchRun,
  mintRun,
  openSessionRunTransition,
  resolveResumeExecutionMode,
  runIdAtOrdinal,
  selectProfileRunTransition,
  selectSkillModeTransition,
  type ChatRun,
} from "./chatRuns";

function run(
  runId: string,
  profile: string,
  patch: Partial<ChatRun> = {},
): ChatRun {
  return {
    runId,
    profile,
    sessionId: null,
    loading: false,
    ...patch,
  };
}

describe("chat run profile transitions", () => {
  it("re-homes a scratch run when switching profiles", () => {
    const runs = [run("run-a", "kitt")];

    const next = selectProfileRunTransition(runs, "run-a", "alfie");

    expect(next.activeRunId).toBe("run-a");
    expect(next.runs).toEqual([{ ...runs[0], profile: "alfie" }]);
  });

  it("activates an existing scratch run for the selected profile", () => {
    const runs = [
      run("run-kitt", "kitt", { sessionId: "session-kitt" }),
      run("run-alfie", "alfie"),
    ];

    const next = selectProfileRunTransition(runs, "run-kitt", "alfie");

    expect(next.activeRunId).toBe("run-alfie");
    expect(next.runs).toBe(runs);
  });

  it("creates a scratch run instead of showing an old-profile chat", () => {
    const randomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000001");
    const runs = [run("run-kitt", "kitt", { sessionId: "session-kitt" })];

    const next = selectProfileRunTransition(runs, "run-kitt", "alfie");

    expect(next.activeRunId).toBe("run-00000000-0000-4000-8000-000000000001");
    expect(next.runs).toEqual([
      runs[0],
      {
        runId: "run-00000000-0000-4000-8000-000000000001",
        profile: "alfie",
        executionMode: "local-chat",
        sessionId: null,
        loading: false,
        seed: undefined,
      },
    ]);
    randomUUID.mockRestore();
  });

  it("recognizes only blank unused runs as scratch", () => {
    expect(isScratchRun(run("blank", "alfie"))).toBe(true);
    expect(isScratchRun(run("session", "alfie", { sessionId: "s1" }))).toBe(
      false,
    );
    expect(isScratchRun(run("loading", "alfie", { loading: true }))).toBe(
      false,
    );
    expect(isScratchRun(run("titled", "alfie", { title: "hello" }))).toBe(
      false,
    );
  });

  it("handles executionMode filtering in isScratchRun", () => {
    const localRun = run("local", "alfie", { executionMode: "local-chat" });
    const skillRun = run("skill", "alfie", { executionMode: "skill-run" });

    expect(isScratchRun(localRun, "local-chat")).toBe(true);
    expect(isScratchRun(localRun, "skill-run")).toBe(false);
    expect(isScratchRun(skillRun, "skill-run")).toBe(true);
    expect(isScratchRun(skillRun, "local-chat")).toBe(false);
  });

  it("mints runs under the requested profile", () => {
    const randomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000002");

    expect(mintRun("alfie")).toEqual({
      runId: "run-00000000-0000-4000-8000-000000000002",
      profile: "alfie",
      executionMode: "local-chat",
      sessionId: null,
      loading: false,
      seed: undefined,
    });
    randomUUID.mockRestore();
  });

  it("opens a saved session with skill-run execution mode preserved", () => {
    const scratch = run("run-scratch", "test-writer", {
      executionMode: "skill-run",
    });
    const saved = run("run-saved", "test-writer", {
      executionMode: "skill-run",
      sessionId: "session-saved",
      title: "Calculator",
    });

    const next = openSessionRunTransition([scratch], "run-scratch", saved);

    expect(next.activeRunId).toBe("run-saved");
    expect(next.runs).toHaveLength(1);
    expect(next.runs[0]?.executionMode).toBe("skill-run");
    expect(next.runs[0]?.title).toBe("Calculator");
  });

  it("replaces the active same-profile scratch run when opening a session", () => {
    const scratch = run("run-scratch", "test-writer");
    const saved = run("run-saved", "test-writer", {
      sessionId: "session-saved",
      title: "ok my bro",
    });

    const next = openSessionRunTransition(
      [run("run-old", "default", { sessionId: "session-old" }), scratch],
      "run-scratch",
      saved,
    );

    expect(next.activeRunId).toBe("run-saved");
    expect(next.runs).toEqual([
      run("run-old", "default", { sessionId: "session-old" }),
      saved,
    ]);
  });

  it("appends a saved session when the active run is not a scratch placeholder", () => {
    const active = run("run-active", "test-writer", {
      sessionId: "session-active",
      title: "existing",
    });
    const saved = run("run-saved", "test-writer", {
      sessionId: "session-saved",
      title: "ok my bro",
    });

    const next = openSessionRunTransition([active], "run-active", saved);

    expect(next.activeRunId).toBe("run-saved");
    expect(next.runs).toEqual([active, saved]);
  });
});

describe("chrome-style tab shortcuts", () => {
  const three = [run("run-1", "a"), run("run-2", "b"), run("run-3", "c")];

  it("cycles forward and backward with wrap-around", () => {
    expect(cycleRunId(three, "run-1", 1)).toBe("run-2");
    expect(cycleRunId(three, "run-3", 1)).toBe("run-1");
    expect(cycleRunId(three, "run-1", -1)).toBe("run-3");
    expect(cycleRunId(three, "run-2", -1)).toBe("run-1");
  });

  it("returns null when there is nothing to cycle to", () => {
    expect(cycleRunId([], "run-x", 1)).toBeNull();
    expect(cycleRunId([run("run-1", "a")], "run-1", 1)).toBeNull();
  });

  it("falls back to the first run when the active id is unknown", () => {
    expect(cycleRunId(three, "run-gone", 1)).toBe("run-1");
  });

  it("selects the Nth tab by ordinal", () => {
    expect(runIdAtOrdinal(three, 1)).toBe("run-1");
    expect(runIdAtOrdinal(three, 3)).toBe("run-3");
  });

  it("maps 9 to the last tab regardless of count", () => {
    expect(runIdAtOrdinal(three, 9)).toBe("run-3");
    expect(runIdAtOrdinal([run("run-only", "a")], 9)).toBe("run-only");
  });

  it("returns null for ordinals without a tab", () => {
    expect(runIdAtOrdinal(three, 4)).toBeNull();
    expect(runIdAtOrdinal([], 1)).toBeNull();
    expect(runIdAtOrdinal([], 9)).toBeNull();
  });
});

describe("resume session to run", () => {
  it("builds a titled non-scratch run when messages are empty", () => {
    const randomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-0000000000aa");

    const run = buildResumedChatRun(
      "default",
      {
        sessionId: "sess-chat",
        title: "Report skills research dir",
        sessionKind: "chat",
        executionProvider: "hermes-chat",
      },
      [],
    );

    expect(run.sessionId).toBe("sess-chat");
    expect(run.title).toBe("Report skills research dir");
    expect(run.seed).toEqual([]);
    expect(run.executionMode).toBe("local-chat");
    expect(isScratchRun(run)).toBe(false);
    randomUUID.mockRestore();
  });

  it("seeds transcript messages when present", () => {
    const seed = [
      {
        id: "u1",
        role: "user" as const,
        content: "hello",
      },
    ];
    const run = buildResumedChatRun(
      "default",
      { sessionId: "sess-chat", title: "hello" },
      seed,
    );
    expect(run.seed).toEqual(seed);
  });

  it("resolves skill-run mode from history pair and prefers skill title override", () => {
    expect(
      resolveResumeExecutionMode({
        sessionId: "s",
        sessionKind: "work",
        executionProvider: "skill-run",
        title: "Sidebar title",
      }),
    ).toEqual({
      executionMode: "skill-run",
      title: "Sidebar title",
    });

    expect(
      resolveResumeExecutionMode(
        {
          sessionId: "s",
          sessionKind: "work",
          executionProvider: "skill-run",
          title: "Sidebar title",
        },
        { executionMode: "skill-run", toolTitle: "Calculator" },
      ),
    ).toEqual({
      executionMode: "skill-run",
      title: "Calculator",
    });
  });

  it("retries load once after onEmpty when the first result is empty", async () => {
    let calls = 0;
    const onEmpty = vi.fn(async () => undefined);
    const items = await fetchWithEmptyRetry(async () => {
      calls += 1;
      return calls === 1 ? [] : [{ id: 1 }];
    }, onEmpty);

    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
    expect(items).toEqual([{ id: 1 }]);
  });

  it("does not call onEmpty when the first load returns items", async () => {
    const onEmpty = vi.fn(async () => undefined);
    const items = await fetchWithEmptyRetry(async () => [{ id: 1 }], onEmpty);
    expect(onEmpty).not.toHaveBeenCalled();
    expect(items).toEqual([{ id: 1 }]);
  });
});

describe("skill mode tab transition", () => {
  it("converts a blank scratch tab in place to skill-run mode", () => {
    const runs = [run("run-a", "alfie", { executionMode: "local-chat" })];

    const next = selectSkillModeTransition(runs, "run-a", "alfie");

    expect(next.activeRunId).toBe("run-a");
    expect(next.runs).toEqual([
      { ...runs[0], executionMode: "skill-run" },
    ]);
    expect(next.runs[0]).not.toHaveProperty("selectedSkill");
  });

  it("stays on an existing skill scratch without mutating runs", () => {
    const runs = [run("run-skill", "alfie", { executionMode: "skill-run" })];

    const next = selectSkillModeTransition(runs, "run-skill", "alfie");

    expect(next.activeRunId).toBe("run-skill");
    expect(next.runs).toBe(runs);
  });

  it("does not mutate other loading tabs when minting a skill scratch", () => {
    const randomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000003");
    const runs = [
      run("run-busy", "alfie", {
        sessionId: "session-busy",
        loading: true,
      }),
      run("run-kitt", "kitt", { sessionId: "session-kitt" }),
    ];

    const next = selectSkillModeTransition(runs, "run-busy", "alfie");

    expect(next.activeRunId).toBe("run-00000000-0000-4000-8000-000000000003");
    expect(next.runs[0]?.loading).toBe(true);
    expect(next.runs[0]?.sessionId).toBe("session-busy");
    expect(next.runs).toHaveLength(3);
    randomUUID.mockRestore();
  });

  it("reuses an existing profile skill scratch instead of minting", () => {
    const runs = [
      run("run-active", "alfie", { sessionId: "session-active" }),
      run("run-skill", "alfie", { executionMode: "skill-run" }),
    ];

    const next = selectSkillModeTransition(runs, "run-active", "alfie");

    expect(next.activeRunId).toBe("run-skill");
    expect(next.runs).toBe(runs);
  });
});
