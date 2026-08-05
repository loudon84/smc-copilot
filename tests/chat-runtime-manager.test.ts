import { describe, expect, it, beforeEach } from "vitest";
import {
  abortRun,
  clearActiveRun,
  getActiveRun,
  hasActiveRun,
  listActiveRunIds,
  setActiveRun,
  __resetChatRuntimeManagerForTests,
} from "../src/main/chat-runtime/chat-runtime-manager";

describe("chat-runtime-manager (runId isolation)", () => {
  beforeEach(() => {
    __resetChatRuntimeManagerForTests();
  });

  it("abort(runId) only cancels the specified run", () => {
    const aborted: string[] = [];
    setActiveRun("run-a", {
      abort: () => aborted.push("run-a"),
      profileId: "default",
      startedAt: Date.now(),
    });
    setActiveRun("run-b", {
      abort: () => aborted.push("run-b"),
      profileId: "default",
      startedAt: Date.now(),
    });
    setActiveRun("run-c", {
      abort: () => aborted.push("run-c"),
      profileId: "writer",
      startedAt: Date.now(),
    });

    expect(listActiveRunIds().sort()).toEqual(["run-a", "run-b", "run-c"]);
    expect(abortRun("run-b")).toBe(true);
    expect(aborted).toEqual(["run-b"]);
    expect(hasActiveRun("run-a")).toBe(true);
    expect(hasActiveRun("run-b")).toBe(false);
    expect(hasActiveRun("run-c")).toBe(true);
    expect(getActiveRun("run-a")).toBeTruthy();
  });

  it("re-registering the same runId aborts the previous handle", () => {
    const aborted: string[] = [];
    setActiveRun("run-x", {
      abort: () => aborted.push("first"),
      profileId: "default",
      startedAt: Date.now(),
    });
    setActiveRun("run-x", {
      abort: () => aborted.push("second"),
      profileId: "default",
      startedAt: Date.now(),
    });
    expect(aborted).toEqual(["first"]);
    expect(listActiveRunIds()).toEqual(["run-x"]);
    abortRun("run-x");
    expect(aborted).toEqual(["first", "second"]);
  });

  it("three concurrent runs do not cross-abort", () => {
    const states = new Map<string, "active" | "aborted">();
    for (const id of ["r1", "r2", "r3"]) {
      states.set(id, "active");
      setActiveRun(id, {
        abort: () => states.set(id, "aborted"),
        profileId: "default",
        startedAt: Date.now(),
      });
    }
    abortRun("r2");
    expect(states.get("r1")).toBe("active");
    expect(states.get("r2")).toBe("aborted");
    expect(states.get("r3")).toBe("active");
    clearActiveRun("r1");
    expect(hasActiveRun("r1")).toBe(false);
    expect(hasActiveRun("r3")).toBe(true);
  });

  it("abort() without id cancels all runs", () => {
    const aborted: string[] = [];
    for (const id of ["a", "b"]) {
      setActiveRun(id, {
        abort: () => aborted.push(id),
        profileId: "default",
        startedAt: Date.now(),
      });
    }
    abortRun();
    expect(aborted.sort()).toEqual(["a", "b"]);
    expect(listActiveRunIds()).toEqual([]);
  });
});
