/**
 * Unit tests for FileJobQueue concurrency and cancel.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FileJobQueue,
  resetFileJobQueue,
} from "./file-job-queue";

describe("FileJobQueue", () => {
  afterEach(() => {
    resetFileJobQueue();
  });

  // @lat: [[file-platform#File job queue]]
  it("limits concurrency to the configured max", async () => {
    const queue = new FileJobQueue(2);
    let running = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    const makeJob = (id: string) => ({
      id,
      kind: "parse",
      run: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => {
          release.push(() => {
            running -= 1;
            resolve();
          });
        });
      },
    });

    queue.enqueue(makeJob("a"));
    queue.enqueue(makeJob("b"));
    queue.enqueue(makeJob("c"));

    await vi.waitFor(() => expect(running).toBe(2));
    expect(queue.stats.pending).toBe(1);
    expect(peak).toBe(2);

    release[0]!();
    await vi.waitFor(() => expect(running).toBe(2));
    release[1]!();
    release[2]!();
    await vi.waitFor(() => expect(queue.stats.running).toBe(0));
    expect(peak).toBe(2);
  });

  it("cancel aborts a pending job before it starts", async () => {
    const queue = new FileJobQueue(1);
    let startedGate!: () => void;
    const gate = new Promise<void>((r) => {
      startedGate = r;
    });
    let secondRan = false;

    queue.enqueue({
      id: "hold",
      kind: "parse",
      run: async () => {
        startedGate();
        await new Promise((r) => setTimeout(r, 30));
      },
    });
    await gate;

    const pendingId = queue.enqueue({
      id: "pending",
      kind: "parse",
      run: async () => {
        secondRan = true;
      },
    });
    queue.cancel(pendingId);

    await queue.waitFor("hold").catch(() => undefined);
    await new Promise((r) => setTimeout(r, 40));
    expect(secondRan).toBe(false);
  });
});
