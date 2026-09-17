import { describe, expect, it, vi } from "vitest";
import {
  KnowledgeBuildPoller,
  nextKnowledgeBuildPollDelayMs,
} from "./knowledge-build-poller";
import type { KnowledgeBuildJobSnapshot } from "../../shared/knowledge/knowledge-base-ipc";

function job(
  overrides: Partial<KnowledgeBuildJobSnapshot> = {},
): KnowledgeBuildJobSnapshot {
  return {
    id: "build-1",
    status: "running",
    progress: 10,
    knowledgeBaseId: "kb-1",
    ...overrides,
  };
}

describe("knowledge build poller", () => {
  it("uses 1.5s then backs off after 20s", () => {
    expect(nextKnowledgeBuildPollDelayMs(0)).toBe(1500);
    expect(nextKnowledgeBuildPollDelayMs(19_999)).toBe(1500);
    expect(nextKnowledgeBuildPollDelayMs(20_000)).toBe(8000);
  });

  it("stops on a terminal snapshot and can cancel mid-flight", async () => {
    const scheduled: Array<{ fn: () => void; delay: number }> = [];
    let now = 0;
    const fetchBuild = vi
      .fn<(buildId: string) => Promise<KnowledgeBuildJobSnapshot>>()
      .mockResolvedValueOnce(job({ status: "running", progress: 20 }))
      .mockResolvedValueOnce(job({ status: "completed", progress: 100 }));
    const onSnapshot = vi.fn();
    const poller = new KnowledgeBuildPoller(fetchBuild, onSnapshot, {
      now: () => now,
      schedule: (fn, delayMs) => {
        scheduled.push({ fn, delay: delayMs });
        return () => {
          const index = scheduled.findIndex((item) => item.fn === fn);
          if (index >= 0) scheduled.splice(index, 1);
        };
      },
    });

    poller.watch("build-1");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delay).toBe(0);
    await scheduled.shift()!.fn();
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running" }),
    );
    expect(scheduled[0]?.delay).toBe(1500);

    now = 21_000;
    await scheduled.shift()!.fn();
    expect(onSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    expect(poller.isWatching("build-1")).toBe(false);
    expect(scheduled).toHaveLength(0);

    poller.watch("build-2");
    expect(poller.isWatching("build-2")).toBe(true);
    poller.unwatch();
    expect(poller.isWatching("build-2")).toBe(false);
    expect(scheduled).toHaveLength(0);
  });
});
