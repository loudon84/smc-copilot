// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { useKnowledgeFacade } from "../src/shared/knowledge/use-knowledge-facade";
import {
  KnowledgeUploadPanel,
  type KnowledgeUploadPanelProps,
} from "../src/renderer/src/screens/Knowledge/features/file-job/KnowledgeUploadPanel";
import type {
  KnowledgeJobBatchResult,
  KnowledgeJobSnapshot,
} from "../src/shared/knowledge/knowledge-job-ipc";

vi.mock("../src/renderer/src/components/useI18n", () => ({
  useI18n: () => ({
    locale: "en",
    setLocale: () => undefined,
    t: (key: string): string => {
      if (!key.startsWith("knowledge.")) return key;
      let value: unknown = knowledgeEn;
      for (const part of key.slice("knowledge.".length).split(".")) {
        if (!value || typeof value !== "object" || !(part in value)) return key;
        value = (value as Record<string, unknown>)[part];
      }
      return typeof value === "string" ? value : key;
    },
  }),
}));

function job(
  overrides: Partial<KnowledgeJobSnapshot> &
    Pick<KnowledgeJobSnapshot, "jobId" | "status">,
): KnowledgeJobSnapshot {
  return {
    knowledgeBaseId: "kb-1",
    attempt: 1,
    partition: {
      workProfileId: "wp",
      authSubject: "user",
      tenantScope: { kind: "personal" },
    },
    dataMode: "mock",
    synthetic: true,
    progress: 0,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fileSummary: { displayName: "demo.pdf", byteSize: 2048 },
    ...overrides,
  };
}

async function open(
  props: Partial<KnowledgeUploadPanelProps> = {},
): Promise<ReturnType<typeof render>> {
  const view = render(
    React.createElement(KnowledgeUploadPanel, {
      knowledgeBaseId: "kb-1",
      baseName: "Alpha",
      capability: { available: true, status: "available" },
      mode: { dataMode: "mock", allowSyntheticData: true, configSource: "env" },
      listSnapshots: async () => [],
      ...props,
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByTestId("knowledge-upload-panel").getAttribute("data-state"),
    ).not.toBe("loading"),
  );
  return view;
}

describe("Knowledge upload panel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { hermesAPI?: unknown }).hermesAPI;
  });

  it("sorts by creation time and keeps rows fixed when progress changes", async () => {
    let listener: ((snapshot: KnowledgeJobSnapshot) => void) | undefined;
    const older = job({ jobId: "older", status: "uploading", progress: 20 });
    const newer = job({
      jobId: "newer",
      status: "uploading",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    await open({
      listSnapshots: async () => [
        older,
        newer,
        job({
          jobId: "foreign",
          status: "completed",
          knowledgeBaseId: "kb-other",
        }),
      ],
      onSnapshotChanged: (callback) => {
        listener = callback;
        return () => undefined;
      },
    });
    const order = (): (string | null)[] =>
      [
        ...screen
          .getByTestId("knowledge-upload-queue")
          .querySelectorAll("li[data-testid]"),
      ].map((item) => item.getAttribute("data-testid"));
    expect(order()).toEqual([
      "knowledge-upload-job-newer",
      "knowledge-upload-job-older",
    ]);
    await act(async () =>
      listener?.({
        ...older,
        revision: 2,
        progress: 90,
        updatedAt: "2026-01-03T00:00:00.000Z",
      }),
    );
    expect(order()).toEqual([
      "knowledge-upload-job-newer",
      "knowledge-upload-job-older",
    ]);
    expect(screen.queryByTestId("knowledge-upload-job-foreign")).toBeNull();
    expect(
      screen.getByTestId("knowledge-upload-job-older").textContent,
    ).toContain("2.0 KB");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("limits mounted file rows while search still reaches later files", async () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      job({
        jobId: `file-${String(index).padStart(3, "0")}`,
        status: "uploading",
        batchId: "large",
        fileSummary: {
          displayName: `file-${String(index).padStart(3, "0")}.pdf`,
        },
      }),
    );
    await open({ listSnapshots: async () => many });
    const rows = (): NodeListOf<HTMLLIElement> =>
      screen
        .getByTestId("knowledge-upload-queue")
        .querySelectorAll<HTMLLIElement>(
          "li[data-testid^='knowledge-upload-job-']",
        );
    expect(rows()).toHaveLength(30);
    expect(
      screen.getByTestId("knowledge-upload-count-total-large").textContent,
    ).toContain("100");
    fireEvent.click(screen.getByTestId("knowledge-upload-show-more-large"));
    expect(rows()).toHaveLength(60);
    fireEvent.change(screen.getByTestId("knowledge-upload-search"), {
      target: { value: "file-099" },
    });
    expect(screen.getByTestId("knowledge-upload-job-file-099")).toBeTruthy();
    expect(rows()).toHaveLength(1);
    fireEvent.change(screen.getByTestId("knowledge-upload-search"), {
      target: { value: "" },
    });
    expect(rows()).toHaveLength(30);
  });

  it("coalesces event bursts and keeps later revisions and deletions", async () => {
    let changed!: (snapshot: KnowledgeJobSnapshot) => void;
    let removed!: (event: { jobId: string; knowledgeBaseId: string }) => void;
    const reconciled = vi.fn();
    await open({
      listSnapshots: async () => [],
      onSnapshotsReconciled: reconciled,
      onSnapshotChanged: (callback) => {
        changed = callback;
        return () => undefined;
      },
      onJobRemoved: (callback) => {
        removed = callback;
        return () => undefined;
      },
    });
    reconciled.mockClear();
    await act(async () => {
      changed(job({ jobId: "latest", status: "uploading", revision: 2 }));
      changed(job({ jobId: "latest", status: "completed", revision: 4 }));
      changed(job({ jobId: "latest", status: "processing", revision: 3 }));
      changed(job({ jobId: "deleted", status: "cancelled", revision: 1 }));
      removed({ jobId: "deleted", knowledgeBaseId: "kb-1" });
      await new Promise((resolve) => setTimeout(resolve, 35));
    });
    expect(
      screen
        .getByTestId("knowledge-upload-job-latest")
        .getAttribute("data-status"),
    ).toBe("completed");
    expect(screen.queryByTestId("knowledge-upload-job-deleted")).toBeNull();
    expect(reconciled).toHaveBeenCalledTimes(2);
  });

  it("chooses a batch through Main and shows mixed results and unknown results separately", async () => {
    const pickAndUpload = vi.fn(async () => ({
      batchId: "batch-1",
      jobs: [
        job({ jobId: "success", status: "completed", batchId: "batch-1" }),
        job({
          jobId: "bad",
          status: "failed",
          batchId: "batch-1",
          errorCode: "FILE_TOO_LARGE",
          canRetry: false,
        }),
        job({
          jobId: "unknown",
          status: "awaiting_confirmation",
          batchId: "batch-1",
          canRetry: false,
        }),
      ],
    }));
    await open({ pickAndUpload });
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-picker")),
    );
    expect(pickAndUpload).toHaveBeenCalledWith({ knowledgeBaseId: "kb-1" });
    expect(
      screen.getByTestId("knowledge-upload-count-total-batch-1").textContent,
    ).toContain("3");
    expect(
      screen.getByTestId("knowledge-upload-count-completed-batch-1")
        .textContent,
    ).toContain("1");
    expect(
      screen.getByTestId("knowledge-upload-count-failed-batch-1").textContent,
    ).toContain("1");
    expect(
      screen.getByTestId("knowledge-upload-count-awaitingConfirmation-batch-1")
        .textContent,
    ).toContain("1");
    expect(document.body.textContent).toContain(
      knowledgeEn.uploads.partialSuccess,
    );
    expect(
      screen.getByTestId("knowledge-upload-error-bad").textContent,
    ).toContain(knowledgeEn.uploads.fileTooLarge);
    expect(screen.queryByTestId("knowledge-upload-retry-unknown")).toBeNull();
    expect(screen.queryByTestId("knowledge-upload-cancel-success")).toBeNull();
  });

  it("accepts dropped files through the Knowledge bridge and shows the new batch", async () => {
    const dropAndUpload = vi.fn(async () => ({
      batchId: "drop",
      jobs: [job({ jobId: "dropped", status: "draft", batchId: "drop" })],
    }));
    await open({ dropAndUpload });
    const file = new File(["text"], "demo.pdf", { type: "application/pdf" });
    await act(async () =>
      fireEvent.drop(screen.getByTestId("knowledge-upload-drop-zone"), {
        dataTransfer: { types: ["Files"], files: [file] },
      }),
    );
    expect(dropAndUpload).toHaveBeenCalledWith({
      knowledgeBaseId: "kb-1",
      files: [file],
    });
    expect(screen.getByTestId("knowledge-upload-job-dropped")).toBeTruthy();
  });

  it("keeps newer events when the initial list or another event arrives late", async () => {
    let resolveList!: (jobs: KnowledgeJobSnapshot[]) => void;
    let listener: ((snapshot: KnowledgeJobSnapshot) => void) | undefined;
    render(
      React.createElement(KnowledgeUploadPanel, {
        knowledgeBaseId: "kb-1",
        capability: { available: true, status: "available" },
        mode: { dataMode: "mock", allowSyntheticData: true },
        listSnapshots: () =>
          new Promise((resolve) => {
            resolveList = resolve;
          }),
        onSnapshotChanged: (callback) => {
          listener = callback;
          return () => undefined;
        },
      }),
    );
    await act(async () =>
      listener?.(
        job({ jobId: "j1", status: "completed", revision: 4, progress: 100 }),
      ),
    );
    await act(async () =>
      resolveList([job({ jobId: "j1", status: "uploading", revision: 2 })]),
    );
    await act(async () =>
      listener?.(job({ jobId: "j1", status: "processing", revision: 3 })),
    );
    await waitFor(() =>
      expect(
        screen
          .getByTestId("knowledge-upload-job-j1")
          .getAttribute("data-status"),
      ).toBe("completed"),
    );
  });

  it("preserves mock completed snapshots and labels processing progress in 0–100 units", async () => {
    let listener: ((snapshot: KnowledgeJobSnapshot) => void) | undefined;
    await open({
      listSnapshots: async () => [
        job({
          jobId: "j1",
          status: "processing",
          phase: "parsing",
          progress: 1,
        }),
      ],
      onSnapshotChanged: (callback) => {
        listener = callback;
        return () => undefined;
      },
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByTestId("knowledge-upload-details-j1"));
    expect(screen.getByTestId("knowledge-upload-job-j1").textContent).toContain(
      knowledgeEn.uploads.progressLabel + ": 1%",
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "1",
    );
    await act(async () =>
      listener?.(
        job({ jobId: "j1", status: "completed", revision: 2, progress: 100 }),
      ),
    );
    await waitFor(() =>
      expect(
        screen
          .getByTestId("knowledge-upload-job-j1")
          .getAttribute("data-status"),
      ).toBe("completed"),
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("does not create jobs when selection is cancelled and catches picker errors", async () => {
    const pickAndUpload = vi
      .fn()
      .mockResolvedValueOnce({ batchId: null, jobs: [] })
      .mockRejectedValueOnce(new Error("KNOWLEDGE_AUTH_REQUIRED"));
    await open({ pickAndUpload });
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-picker")),
    );
    expect(screen.getByTestId("knowledge-upload-queue-empty")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-picker")),
    );
    expect(
      screen.getByTestId("knowledge-upload-pick-error").textContent,
    ).toContain(knowledgeEn.uploads.authError);
  });

  it("prevents repeated picker clicks while selection is pending", async () => {
    let resolvePick!: (result: KnowledgeJobBatchResult) => void;
    const pickAndUpload = vi.fn(
      () =>
        new Promise<KnowledgeJobBatchResult>((resolve) => {
          resolvePick = resolve;
        }),
    );
    await open({ pickAndUpload });
    act(() => {
      fireEvent.click(screen.getByTestId("knowledge-upload-picker"));
      fireEvent.click(screen.getByTestId("knowledge-upload-picker"));
    });
    expect(pickAndUpload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("knowledge-upload-picker")).toBeDisabled();
    await act(async () => resolvePick({ batchId: null, jobs: [] }));
    expect(screen.getByTestId("knowledge-upload-picker")).not.toBeDisabled();
  });

  it("runs batch commands only for allowed rows and reports per-file action failures", async () => {
    const retryJob = vi.fn(async ({ jobId }: { jobId: string }) => {
      if (jobId === "recoverable-2") throw new Error("KNOWLEDGE_UNAVAILABLE");
      return job({
        jobId,
        status: "queued",
        revision: 2,
        batchId: "b",
        canCancel: true,
        canRetry: false,
      });
    });
    const cancelJob = vi.fn(async ({ jobId }: { jobId: string }) =>
      job({
        jobId,
        status: "cancelled",
        revision: 3,
        batchId: "b",
        canCancel: false,
      }),
    );
    await open({
      retryJob,
      cancelJob,
      listSnapshots: async () => [
        job({
          jobId: "recoverable-1",
          status: "failed",
          batchId: "b",
          canRetry: true,
        }),
        job({
          jobId: "recoverable-2",
          status: "failed",
          batchId: "b",
          canRetry: true,
        }),
        job({
          jobId: "invalid",
          status: "failed",
          batchId: "b",
          canRetry: false,
        }),
        job({
          jobId: "done",
          status: "completed",
          batchId: "b",
          canCancel: false,
        }),
      ],
    });
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-retry-batch-b")),
    );
    expect(retryJob).toHaveBeenCalledTimes(2);
    expect(retryJob).not.toHaveBeenCalledWith({ jobId: "invalid" });
    expect(
      screen.getByTestId("knowledge-upload-error-recoverable-2").textContent,
    ).toContain(knowledgeEn.uploads.serviceError);
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-cancel-batch-b")),
    );
    expect(cancelJob).toHaveBeenCalledWith({ jobId: "recoverable-1" });
    expect(cancelJob).toHaveBeenCalledTimes(1);
  });

  it("limits batch commands to two at a time and reconciles their results once", async () => {
    const pending = new Map<string, (snapshot: KnowledgeJobSnapshot) => void>();
    const cancelJob = vi.fn(
      ({ jobId }: { jobId: string }) =>
        new Promise<KnowledgeJobSnapshot>((resolve) => {
          pending.set(jobId, resolve);
        }),
    );
    const reconciled = vi.fn();
    await open({
      cancelJob,
      onSnapshotsReconciled: reconciled,
      listSnapshots: async () =>
        ["a", "b", "c"].map((jobId) =>
          job({ jobId, status: "queued", batchId: "batch", canCancel: true }),
        ),
    });
    reconciled.mockClear();
    fireEvent.click(screen.getByTestId("knowledge-upload-cancel-batch-batch"));
    expect(cancelJob).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.get("a")!(job({ jobId: "a", status: "cancelled", revision: 2 }));
    });
    expect(cancelJob).toHaveBeenCalledTimes(3);
    await act(async () => {
      pending.get("b")!(job({ jobId: "b", status: "cancelled", revision: 2 }));
      pending.get("c")!(job({ jobId: "c", status: "cancelled", revision: 2 }));
    });
    expect(reconciled).toHaveBeenCalledTimes(1);
  });

  it("distinguishes interrupted local imports from uncertain remote uploads", async () => {
    await open({
      listSnapshots: async () => [
        job({
          jobId: "local",
          status: "interrupted",
          errorCode: "INTERRUPTED",
        }),
        job({
          jobId: "remote",
          status: "awaiting_confirmation",
          errorCode: "INTERRUPTED",
        }),
        job({
          jobId: "processing",
          status: "failed",
          errorCode: "INGESTION_FAILED",
        }),
      ],
    });
    expect(screen.getByTestId("knowledge-upload-error-local").textContent).toBe(
      knowledgeEn.uploads.localImportInterrupted,
    );
    expect(
      screen.getByTestId("knowledge-upload-error-remote").textContent,
    ).toBe(knowledgeEn.uploads.remoteResultUnknown);
    expect(
      screen.getByTestId("knowledge-upload-error-processing").textContent,
    ).toBe(knowledgeEn.uploads.ingestionFailed);
    expect(
      screen.getByTestId("knowledge-upload-job-remote").textContent,
    ).not.toContain(knowledgeEn.uploads.awaitingHint);
  });

  it("deletes failed records offline and ignores late list or snapshot responses", async () => {
    const failed = job({
      jobId: "failed",
      status: "failed",
      batchId: "b",
      revision: 3,
      canCancel: false,
    });
    const other = job({
      jobId: "other",
      status: "failed",
      batchId: "b",
      revision: 2,
      canCancel: false,
    });
    let resolveList!: (jobs: KnowledgeJobSnapshot[]) => void;
    let removedListener!: (removed: {
      jobId: string;
      knowledgeBaseId: string;
    }) => void;
    let snapshotListener!: (snapshot: KnowledgeJobSnapshot) => void;
    const listSnapshots = vi
      .fn()
      .mockResolvedValueOnce([failed, other])
      .mockImplementationOnce(
        () =>
          new Promise<KnowledgeJobSnapshot[]>((resolve) => {
            resolveList = resolve;
          }),
      );
    const deleteCancelled = vi
      .fn()
      .mockRejectedValueOnce(new Error("KNOWLEDGE_JOB_DELETE_CONFLICT"))
      .mockResolvedValueOnce({ jobId: "failed", knowledgeBaseId: "kb-1" });
    await open({
      capability: { available: false, status: "blocked_provider_unavailable" },
      mode: { dataMode: "provider", allowSyntheticData: false },
      listSnapshots,
      deleteCancelled,
      onJobRemoved: (callback) => {
        removedListener = callback;
        return () => undefined;
      },
      onSnapshotChanged: (callback) => {
        snapshotListener = callback;
        return () => undefined;
      },
    });
    await screen.findByTestId("knowledge-upload-delete-failed");
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-delete-failed")),
    );
    expect(screen.getByTestId("knowledge-upload-job-failed")).toBeTruthy();
    expect(
      screen.getByTestId("knowledge-upload-error-failed").textContent,
    ).toContain(knowledgeEn.uploads.deleteConflict);
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(listSnapshots).toHaveBeenCalledTimes(2));
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-delete-failed")),
    );
    expect(deleteCancelled).toHaveBeenLastCalledWith({
      jobId: "failed",
      expectedRevision: 3,
    });
    expect(screen.queryByTestId("knowledge-upload-job-failed")).toBeNull();
    await act(async () => {
      snapshotListener(failed);
      removedListener({ jobId: "other", knowledgeBaseId: "kb-1" });
      resolveList([failed, other]);
    });
    expect(screen.queryByTestId("knowledge-upload-job-failed")).toBeNull();
    expect(screen.queryByTestId("knowledge-upload-job-other")).toBeNull();
    expect(screen.queryByTestId("knowledge-upload-batch-b")).toBeNull();
  });

  it("deletes failed records but retains cancelled and remote-unconfirmed tasks", async () => {
    const failed = job({
      jobId: "failed",
      status: "failed",
      batchId: "b",
      revision: 3,
    });
    const other = job({
      jobId: "other-failed",
      status: "failed",
      batchId: "b",
      revision: 2,
    });
    const pending = job({
      jobId: "pending",
      status: "awaiting_confirmation",
      batchId: "b",
      errorCode: "INTERRUPTED",
    });
    const cancelled = job({
      jobId: "cancelled",
      status: "cancelled",
      batchId: "b",
    });
    const listSnapshots = vi
      .fn()
      .mockResolvedValueOnce([failed, other, pending, cancelled])
      .mockResolvedValue([other, pending, cancelled]);
    const deleteCancelled = vi.fn(async () => ({
      jobId: failed.jobId,
      knowledgeBaseId: "kb-1",
    }));
    let removedListener!: (removed: {
      jobId: string;
      knowledgeBaseId: string;
    }) => void;
    await open({
      listSnapshots,
      deleteCancelled,
      onJobRemoved: (callback) => {
        removedListener = callback;
        return () => undefined;
      },
    });
    expect(screen.getByTestId("knowledge-upload-delete-failed")).toBeTruthy();
    expect(screen.queryByTestId("knowledge-upload-delete-pending")).toBeNull();
    expect(
      screen.queryByTestId("knowledge-upload-delete-cancelled"),
    ).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-delete-failed")),
    );
    expect(deleteCancelled).toHaveBeenCalledWith({
      jobId: "failed",
      expectedRevision: 3,
    });
    expect(screen.queryByTestId("knowledge-upload-job-failed")).toBeNull();
    await act(async () => fireEvent(document, new Event("visibilitychange")));
    expect(screen.queryByTestId("knowledge-upload-job-failed")).toBeNull();
    act(() => removedListener({ jobId: other.jobId, knowledgeBaseId: "kb-1" }));
    expect(
      screen.queryByTestId("knowledge-upload-job-other-failed"),
    ).toBeNull();
    expect(screen.getByTestId("knowledge-upload-job-pending")).toBeTruthy();
    expect(screen.getByTestId("knowledge-upload-job-cancelled")).toBeTruthy();
    expect(
      screen.getByTestId("knowledge-upload-count-total-b").textContent,
    ).toContain("2");
  });

  it("explains when the running preload lacks the delete command", async () => {
    await open({
      listSnapshots: async () => [
        job({ jobId: "old", status: "failed", canCancel: false }),
      ],
    });
    const button = screen.getByTestId("knowledge-upload-delete-old");
    expect(button).toBeDisabled();
    expect(button.getAttribute("title")).toBe(
      knowledgeEn.uploads.deleteRequiresRestart,
    );
  });

  it("disables repeated per-file actions and catches cancellation failures", async () => {
    let rejectCancel!: (error: Error) => void;
    const cancelJob = vi.fn(
      () =>
        new Promise<KnowledgeJobSnapshot>((_resolve, reject) => {
          rejectCancel = reject;
        }),
    );
    await open({
      cancelJob,
      listSnapshots: async () => [
        job({ jobId: "j1", status: "queued", canCancel: true }),
      ],
    });
    act(() => {
      fireEvent.click(screen.getByTestId("knowledge-upload-cancel-j1"));
      fireEvent.click(screen.getByTestId("knowledge-upload-cancel-j1"));
    });
    expect(cancelJob).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("knowledge-upload-cancel-j1")).toBeDisabled();
    await act(async () => rejectCancel(new Error("KNOWLEDGE_UNAVAILABLE")));
    expect(
      screen.getByTestId("knowledge-upload-error-j1").textContent,
    ).toContain(knowledgeEn.uploads.serviceError);
    expect(screen.getByTestId("knowledge-upload-cancel-j1")).not.toBeDisabled();
  });

  it("restores batch summaries and per-file errors after reopening", async () => {
    const snapshots = [
      job({
        jobId: "j1",
        status: "failed",
        batchId: "persisted",
        errorCode: "FILE_TOO_LARGE",
      }),
    ];
    const props = { listSnapshots: async () => snapshots };
    const view = await open(props);
    view.unmount();
    await open(props);
    expect(screen.getByTestId("knowledge-upload-batch-persisted")).toBeTruthy();
    expect(
      screen.getByTestId("knowledge-upload-error-j1").textContent,
    ).toContain(knowledgeEn.uploads.fileTooLarge);
  });

  it("hides the picker without a knowledge base and never owns a setInterval", async () => {
    const panelSource = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../src/renderer/src/screens/Knowledge/features/file-job/KnowledgeUploadPanel.tsx",
      ),
      "utf8",
    );
    expect(panelSource).not.toMatch(/setInterval\s*\(/);
    await open({ knowledgeBaseId: "" });
    expect(screen.queryByTestId("knowledge-upload-picker")).toBeNull();
  });

  it("disables picker without the new batch command and locks its base", async () => {
    const view = await open({
      mode: { dataMode: "provider", allowSyntheticData: false },
    });
    expect(screen.getByTestId("knowledge-upload-picker")).toBeDisabled();
    view.unmount();
    const pickAndUpload = vi.fn(async () => ({ batchId: null, jobs: [] }));
    await open({
      knowledgeBaseId: "kb-42",
      baseName: "Locked Base",
      pickAndUpload,
    });
    expect(screen.getByTestId("knowledge-upload-target").textContent).toContain(
      "Locked Base",
    );
    expect(
      screen
        .getByRole("group", { name: knowledgeEn.uploads.filterLabel })
        .getAttribute("data-testid"),
    ).toBe("knowledge-upload-filter");
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-picker")),
    );
    expect(pickAndUpload).toHaveBeenCalledWith({ knowledgeBaseId: "kb-42" });
  });

  it("explains a missing batch command from the loaded preload without calling the legacy command", async () => {
    const createDraft = vi.fn();
    const getCapability = vi.fn(async () => ({
      available: true,
      status: "available",
    }));
    const getMode = vi.fn(async () => ({
      dataMode: "provider",
      allowSyntheticData: false,
    }));
    const listSnapshots = vi.fn(async () => []);
    (window as unknown as { hermesAPI: unknown }).hermesAPI = {
      knowledgeJobs: { getCapability, getMode, listSnapshots, createDraft },
    };
    await open({
      capability: undefined,
      mode: undefined,
      listSnapshots: undefined,
    });
    const picker = screen.getByTestId("knowledge-upload-picker");
    expect(getCapability).toHaveBeenCalled();
    expect(listSnapshots).toHaveBeenCalled();
    expect(picker).toBeDisabled();
    expect(picker.getAttribute("title")).toBe(
      knowledgeEn.uploads.pickerRequiresRestart,
    );
    expect(document.body.textContent).toContain(
      knowledgeEn.uploads.pickerRequiresRestart,
    );
    expect(document.body.textContent).not.toContain(
      knowledgeEn.uploads.pickerDisabledProvider,
    );
    fireEvent.click(picker);
    expect(createDraft).not.toHaveBeenCalled();
    expect(screen.queryByTestId("knowledge-upload-query")).toBeNull();
  });

  it("keeps 80 percent in details and only marks confirmed completion as complete", async () => {
    await open({
      listSnapshots: async () => [
        job({
          jobId: "waiting",
          status: "processing",
          phase: "validating",
          progress: 80,
          lastRemoteConfirmedAt: "2026-10-08T10:00:00Z",
        }),
        job({
          jobId: "unknown",
          status: "awaiting_confirmation",
          progress: 100,
          lastRemoteConfirmedAt: "invalid",
        }),
      ],
    });
    const waiting = screen.getByTestId("knowledge-upload-job-waiting");
    expect(waiting.textContent).not.toContain("80%");
    expect(
      waiting.querySelector("li:last-child")?.getAttribute("data-stage-state"),
    ).toBe("pending");
    expect(
      screen
        .getByTestId("knowledge-upload-sync-waiting")
        .querySelector("time")
        ?.getAttribute("datetime"),
    ).toBe("2026-10-08T10:00:00Z");
    expect(
      screen.getByTestId("knowledge-upload-sync-unknown").textContent,
    ).toContain(knowledgeEn.uploads.notRemoteConfirmed);
    expect(
      screen
        .getByTestId("knowledge-upload-job-unknown")
        .querySelectorAll('[data-stage-state="done"]'),
    ).toHaveLength(0);
    fireEvent.click(screen.getByTestId("knowledge-upload-details-waiting"));
    expect(waiting.textContent).toContain("80%");
    expect(waiting.textContent).toContain(knowledgeEn.uploads.progressHint);
  });

  it("keeps uncertain-result guidance without manual status or reload controls", async () => {
    const refreshStatus = vi.fn();
    await open({
      listSnapshots: async () => [
        job({
          jobId: "unknown",
          status: "awaiting_confirmation",
          errorCode: "INTERRUPTED",
          canQueryRemoteStatus: false,
        }),
      ],
      refreshStatus,
    });
    expect(
      screen.getByTestId("knowledge-upload-query-no-remote-id").textContent,
    ).toBe(knowledgeEn.uploads.queryNoRemoteId);
    expect(screen.queryByTestId("knowledge-upload-query")).toBeNull();
    expect(screen.queryByTestId("knowledge-upload-reload")).toBeNull();
    expect(screen.queryByTestId("knowledge-upload-view-files")).toBeNull();
    expect(refreshStatus).not.toHaveBeenCalled();
  });

  it("retries provider connection while preserving local tasks", async () => {
    const onRefreshCapability = vi.fn(async () => ({
      available: false,
      status: "blocked_provider_unavailable" as const,
    }));
    await open({
      capability: { available: false, status: "blocked_provider_unavailable" },
      mode: { dataMode: "provider", allowSyntheticData: false },
      listSnapshots: async () => [
        job({ jobId: "offline", status: "processing" }),
      ],
      onRefreshCapability,
    });
    expect(screen.getByTestId("knowledge-upload-job-offline")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-reconnect")),
    );
    expect(onRefreshCapability).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("knowledge-upload-reload-result").textContent,
    ).toContain(knowledgeEn.uploads.reconnectUnavailable);
  });

  it("retries a failed local list automatically when the page becomes visible", async () => {
    const listSnapshots = vi
      .fn()
      .mockRejectedValueOnce(new Error("KNOWLEDGE_UNAVAILABLE"))
      .mockResolvedValueOnce([]);
    await open({ listSnapshots });
    expect(
      screen.getByTestId("knowledge-upload-panel").getAttribute("data-state"),
    ).toBe("error");
    await act(async () => fireEvent(document, new Event("visibilitychange")));
    await waitFor(() =>
      expect(
        screen.getByTestId("knowledge-upload-panel").getAttribute("data-state"),
      ).toBe("empty"),
    );
    expect(listSnapshots).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["AUTH_REQUIRED", "authError"],
    ["PROVIDER_UNAVAILABLE", "serviceError"],
    ["CONTRACT_INVALID", "contractError"],
    ["PARTITION_DENIED", "identityChanged"],
  ] as const)(
    "explains safe IPC error %s without private exception text",
    async (code, key) => {
      await open({
        pickAndUpload: async () => {
          throw new Error(`Error invoking remote method: ${code} private-text`);
        },
      });
      await act(async () =>
        fireEvent.click(screen.getByTestId("knowledge-upload-picker")),
      );
      const error = screen.getByTestId("knowledge-upload-pick-error");
      expect(error.textContent).toContain(knowledgeEn.uploads[key]);
      expect(error.querySelector("details")?.textContent).toContain(code);
      expect(error.textContent).not.toContain("private-text");
    },
  );

  it("orders capability rechecks ahead of late initial results and respects injected capability", async () => {
    let resolveInitial!: (capability: {
      available: boolean;
      status: "blocked_provider_unavailable";
    }) => void;
    const getCapability = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = resolve;
          }),
      )
      .mockResolvedValue({ available: true, status: "available" });
    (window as unknown as { hermesAPI: unknown }).hermesAPI = {
      knowledgeJobs: { getCapability },
    };
    const view = renderHook(
      (props: {
        capability?: {
          available: boolean;
          status: "blocked_provider_unavailable";
        };
      }) => useKnowledgeFacade(props),
      { initialProps: {} },
    );
    await act(async () => {
      await view.result.current.refreshCapability();
    });
    expect(view.result.current.mutationsEnabled).toBe(true);
    await act(async () =>
      resolveInitial({
        available: false,
        status: "blocked_provider_unavailable",
      }),
    );
    expect(view.result.current.mutationsEnabled).toBe(true);
    view.rerender({
      capability: { available: false, status: "blocked_provider_unavailable" },
    });
    await act(async () => {
      await view.result.current.refreshCapability();
    });
    expect(view.result.current.mutationsEnabled).toBe(false);
    expect(getCapability).toHaveBeenCalledTimes(2);
  });

  it("reconciles local snapshots on active and visible return without querying remotely", async () => {
    let visible: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visible,
    );
    const listSnapshots = vi
      .fn()
      .mockResolvedValueOnce([job({ jobId: "live", status: "processing" })])
      .mockResolvedValue([
        job({ jobId: "live", status: "failed", revision: 2 }),
      ]);
    const refreshStatus = vi.fn();
    const props = {
      knowledgeBaseId: "kb-1",
      capability: { available: true, status: "available" as const },
      mode: { dataMode: "provider" as const, allowSyntheticData: false },
      listSnapshots,
      refreshStatus,
    };
    const view = await open(props);
    view.rerender(
      React.createElement(KnowledgeUploadPanel, { ...props, active: false }),
    );
    visible = "hidden";
    fireEvent(document, new Event("visibilitychange"));
    expect(listSnapshots).toHaveBeenCalledTimes(1);
    visible = "visible";
    view.rerender(
      React.createElement(KnowledgeUploadPanel, { ...props, active: true }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByTestId("knowledge-upload-job-live")
          .getAttribute("data-status"),
      ).toBe("failed"),
    );
    visible = "hidden";
    fireEvent(document, new Event("visibilitychange"));
    visible = "visible";
    await act(async () => fireEvent(document, new Event("visibilitychange")));
    expect(listSnapshots).toHaveBeenCalledTimes(3);
    expect(refreshStatus).not.toHaveBeenCalled();
  });

  it("searches visible rows while keeping full-batch counts and command scope", async () => {
    const retryJob = vi.fn(async ({ jobId }: { jobId: string }) =>
      job({
        jobId,
        status: "queued",
        revision: 2,
        batchId: "b",
        canRetry: false,
      }),
    );
    await open({
      retryJob,
      listSnapshots: async () => [
        job({
          jobId: "first",
          status: "failed",
          batchId: "b",
          canRetry: true,
          fileSummary: { displayName: "alpha.pdf" },
        }),
        job({
          jobId: "second",
          status: "failed",
          batchId: "b",
          canRetry: true,
          fileSummary: { displayName: "beta.pdf" },
        }),
        job({
          jobId: "done",
          status: "completed",
          batchId: "done-batch",
          fileSummary: { displayName: "gamma.pdf" },
        }),
      ],
    });
    fireEvent.click(screen.getByTestId("knowledge-upload-expand-done-batch"));
    expect(screen.queryByTestId("knowledge-upload-job-done")).toBeNull();
    fireEvent.change(screen.getByTestId("knowledge-upload-search"), {
      target: { value: "alpha" },
    });
    expect(screen.queryByTestId("knowledge-upload-job-second")).toBeNull();
    expect(
      screen.getByTestId("knowledge-upload-batch-done-batch"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("knowledge-upload-batch-no-matches-done-batch"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("knowledge-upload-count-total-b").textContent,
    ).toContain("2");
    expect(
      screen.getByTestId("knowledge-upload-batch-b").textContent,
    ).toContain(knowledgeEn.uploads.fullBatchScope);
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-retry-batch-b")),
    );
    expect(retryJob).toHaveBeenCalledWith({ jobId: "first" });
    expect(retryJob).toHaveBeenCalledWith({ jobId: "second" });
    fireEvent.change(screen.getByTestId("knowledge-upload-search"), {
      target: { value: "gamma" },
    });
    expect(screen.getByTestId("knowledge-upload-job-done")).toBeTruthy();
    expect(screen.getByTestId("knowledge-upload-batch-b")).toBeTruthy();
    expect(
      screen.getByTestId("knowledge-upload-batch-no-matches-b"),
    ).toBeTruthy();
    fireEvent.change(screen.getByTestId("knowledge-upload-search"), {
      target: { value: "" },
    });
    expect(screen.queryByTestId("knowledge-upload-job-done")).toBeNull();
  });

  it("filters states and shows a no-matches result", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    await open({
      listSnapshots: async () => [
        job({ jobId: "active", status: "processing" }),
        job({ jobId: "unknown", status: "awaiting_confirmation" }),
      ],
    });
    expect(
      screen.getByTestId("knowledge-upload-filter-all").textContent,
    ).toContain("(2)");
    expect(
      screen.getByTestId("knowledge-upload-filter-needsAttention").textContent,
    ).toContain("(1)");
    fireEvent.click(
      screen.getByTestId("knowledge-upload-filter-needsAttention"),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("knowledge-upload-job-active")).toBeNull(),
    );
    expect(screen.getByTestId("knowledge-upload-job-unknown")).toBeTruthy();
    fireEvent.change(screen.getByTestId("knowledge-upload-search"), {
      target: { value: "no-such-file" },
    });
    expect(screen.getByTestId("knowledge-upload-no-matches")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: knowledgeEn.uploads.clearFilters }),
    );
    expect(
      screen
        .getByTestId("knowledge-upload-filter-all")
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("knowledge-upload-job-active")).toBeTruthy();
  });

  it("retains readable per-file gate rejection without reporting success (A-PFC-008)", async () => {
    await open({
      listSnapshots: async () => [
        job({
          jobId: "j-gate",
          status: "failed",
          errorCode: "FILE_CONTENT_ENCRYPTED_OR_INVALID",
          canRetry: false,
        }),
      ],
    });
    expect(
      screen.getByTestId("knowledge-upload-error-j-gate").textContent,
    ).toContain(knowledgeEn.uploads.contentUnreadable);
    expect(
      screen
        .getByTestId("knowledge-upload-job-j-gate")
        .getAttribute("data-status"),
    ).toBe("failed");
    expect(screen.queryByTestId("knowledge-upload-retry-j-gate")).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /confirmed Eisoo|已确认亿赛通/i,
    );
  });

  it("shows upload-byte ban per row when the content gate fails (A-UBG-007)", async () => {
    let listener: ((snapshot: KnowledgeJobSnapshot) => void) | undefined;
    await open({
      onSnapshotChanged: (callback) => {
        listener = callback;
        return () => undefined;
      },
    });
    await act(async () =>
      listener?.(
        job({
          jobId: "j-up",
          status: "failed",
          errorCode: "FILE_UPLOAD_CONTENT_UNREADABLE",
        }),
      ),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId("knowledge-upload-job-j-up")).getByRole(
          "alert",
        ).textContent,
      ).toContain(knowledgeEn.uploads.uploadContentUnreadable),
    );
    expect(
      screen.getByTestId("knowledge-upload-byte-error").textContent,
    ).not.toMatch(/confirmed Eisoo|已确认亿赛通/i);
  });
});
