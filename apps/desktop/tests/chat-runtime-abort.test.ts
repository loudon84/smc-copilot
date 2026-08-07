import { describe, expect, it } from "vitest";

/**
 * Abort finish* lifecycle unit model — mirrors chat-runtime-ipc guards.
 */
function createFinishMachine() {
  let finished = false;
  const results: string[] = [];
  const finishOnce = (label: string) => {
    if (finished) return false;
    finished = true;
    results.push(label);
    return true;
  };
  return {
    results,
    finishCompleted: () => finishOnce("completed"),
    finishFailed: () => finishOnce("failed"),
    finishCancelled: () => finishOnce("cancelled"),
    get finished() {
      return finished;
    },
  };
}

describe("chat-runtime abort finish lifecycle", () => {
  it("finish* functions are mutually exclusive (only once)", () => {
    const m = createFinishMachine();
    expect(m.finishCancelled()).toBe(true);
    expect(m.finishCompleted()).toBe(false);
    expect(m.finishFailed()).toBe(false);
    expect(m.results).toEqual(["cancelled"]);
    expect(m.finished).toBe(true);
  });

  it("completed then cancelled is a no-op", () => {
    const m = createFinishMachine();
    expect(m.finishCompleted()).toBe(true);
    expect(m.finishCancelled()).toBe(false);
    expect(m.results).toEqual(["completed"]);
  });
});
