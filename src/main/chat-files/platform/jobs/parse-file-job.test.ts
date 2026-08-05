/**
 * Unit tests for parse-file job event emission.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../file-parse-service", () => ({
  parseFile: vi.fn(),
}));

vi.mock("../file-config", () => ({
  readDesktopFilesConfig: () => ({
    parsing: { enabled: true, concurrency: 2 },
    indexing: { enabled: false },
  }),
}));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));

import { parseFile } from "../file-parse-service";
import { subscribeFileJobEvents } from "./file-job-events";
import { enqueueParseFileJob } from "./parse-file-job";
import { resetFileJobQueue } from "./file-job-queue";
import type { FileJobEvent } from "../../../../shared/files";

const parseMock = vi.mocked(parseFile);

describe("enqueueParseFileJob", () => {
  afterEach(() => {
    resetFileJobQueue();
    parseMock.mockReset();
  });

  it("emits started → progress → completed on success", async () => {
    parseMock.mockResolvedValue({
      fileId: "f1",
      parserId: "text",
      parserVersion: 1,
      text: "hi",
      sections: [],
      metadata: {},
      truncated: false,
      parsedAt: new Date().toISOString(),
    });

    const events: FileJobEvent[] = [];
    const unsub = subscribeFileJobEvents((e) => events.push(e));

    await enqueueParseFileJob({
      profile: "default",
      fileId: "f1",
      wait: true,
    });
    unsub();

    expect(events.map((e) => e.type)).toEqual([
      "file-job:started",
      "file-job:progress",
      "file-job:progress",
      "file-job:completed",
    ]);
    expect(parseMock).toHaveBeenCalledWith(
      "default",
      "f1",
      expect.objectContaining({ skipConcurrency: true }),
    );
  });

  it("emits failed when parseFile throws", async () => {
    parseMock.mockRejectedValue(new Error("boom"));
    const events: FileJobEvent[] = [];
    const unsub = subscribeFileJobEvents((e) => events.push(e));

    await expect(
      enqueueParseFileJob({ fileId: "f2", wait: true }),
    ).rejects.toThrow();
    unsub();

    const failed = events.find((e) => e.type === "file-job:failed");
    expect(failed).toBeTruthy();
    if (failed?.type === "file-job:failed") {
      expect(failed.error.message).toContain("boom");
    }
  });
});
