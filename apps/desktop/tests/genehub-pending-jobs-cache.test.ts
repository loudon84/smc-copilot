import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let profileRoot = mkdtempSync(join(tmpdir(), "genehub-cache-test-"));

vi.mock("../src/main/utils", () => ({
  profileHome: () => profileRoot,
  safeWriteFile: (path: string, content: string) => {
    const { mkdirSync, writeFileSync } = require("fs");
    const { dirname } = require("path");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
  },
}));

import {
  getCachedPendingJobs,
  mergePendingJobs,
  writePendingJobsCache,
} from "../src/main/genehub/pending-jobs-cache";
import type { InstallJob } from "../src/shared/genehub/genehub-contract";

beforeEach(() => {
  profileRoot = mkdtempSync(join(tmpdir(), "genehub-cache-test-"));
  writePendingJobsCache([]);
});

describe("pending-jobs-cache", () => {
  it("writes and reads cached jobs", () => {
    const jobs: InstallJob[] = [
      {
        jobId: "job_1",
        profileId: "p1",
        geneSlug: "demo",
        geneVersion: "1.0.0",
        skillName: "demo",
        action: "install",
        status: "pending",
        source: "mcp_agent_request",
      },
    ];
    writePendingJobsCache(jobs);
    expect(getCachedPendingJobs()).toHaveLength(1);
    expect(getCachedPendingJobs()[0].jobId).toBe("job_1");
  });

  it("mergePendingJobs dedupes by jobId and prefers fresh fields", () => {
    const existing: InstallJob[] = [
      {
        jobId: "job_1",
        profileId: "p1",
        geneSlug: "demo",
        geneVersion: "1.0.0",
        skillName: "demo",
        action: "install",
        status: "pending",
        source: "mcp_agent_request",
      },
    ];
    const fresh: InstallJob[] = [
      {
        jobId: "job_1",
        profileId: "p1",
        geneSlug: "demo",
        geneVersion: "1.0.1",
        skillName: "demo",
        action: "install",
        status: "downloading",
        source: "mcp_agent_request",
      },
      {
        jobId: "job_2",
        profileId: "p1",
        geneSlug: "other",
        geneVersion: "2.0.0",
        skillName: "other",
        action: "install",
        status: "pending",
        source: "server_assigned",
      },
    ];
    const merged = mergePendingJobs(existing, fresh);
    expect(merged).toHaveLength(2);
    expect(merged.find((j) => j.jobId === "job_1")?.geneVersion).toBe("1.0.1");
    expect(merged.find((j) => j.jobId === "job_1")?.status).toBe("downloading");
  });
});
