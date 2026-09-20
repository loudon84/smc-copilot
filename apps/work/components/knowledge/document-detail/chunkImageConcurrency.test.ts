import { describe, expect, it, beforeEach } from "vitest";
import {
  chunkImageConcurrencyStats,
  resetChunkImageConcurrencyForTests,
  withChunkImageConcurrency,
} from "./chunkImageConcurrency";

describe("chunkImageConcurrency", () => {
  beforeEach(() => {
    resetChunkImageConcurrencyForTests();
  });

  it("limits in-flight work to 3 and drains the queue", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: number[] = [];
    const tasks = [0, 1, 2, 3, 4].map((i) =>
      withChunkImageConcurrency(async () => {
        started.push(i);
        await gate;
        return i;
      }),
    );
    await Promise.resolve();
    expect(chunkImageConcurrencyStats().inFlight).toBe(3);
    expect(started).toEqual([0, 1, 2]);
    release();
    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(chunkImageConcurrencyStats().inFlight).toBe(0);
    expect(chunkImageConcurrencyStats().queued).toBe(0);
  });
});
