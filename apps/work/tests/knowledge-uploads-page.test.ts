// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeUploadPanel } from "../src/renderer/src/screens/Knowledge/features/file-job/KnowledgeUploadPanel";
import type { KnowledgeJobSnapshot } from "../src/shared/knowledge/knowledge-job-ipc";

vi.mock("../src/renderer/src/components/useI18n", () => ({
  useI18n: () => ({
    locale: "en",
    setLocale: () => undefined,
    t: (key: string): string => {
      if (!key.startsWith("knowledge.")) return key;
      const parts = key.slice("knowledge.".length).split(".");
      let cur: unknown = knowledgeEn;
      for (const part of parts) {
        if (cur && typeof cur === "object" && part in (cur as object)) {
          cur = (cur as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof cur === "string" ? cur : key;
    },
  }),
}));

function job(
  overrides: Partial<KnowledgeJobSnapshot> & Pick<KnowledgeJobSnapshot, "jobId" | "status">,
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
    progress: overrides.progress ?? 0,
    updatedAt: new Date().toISOString(),
    fileSummary: { displayName: "demo.pdf" },
    ...overrides,
  };
}

describe("Knowledge upload panel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { hermesAPI?: unknown }).hermesAPI;
  });

  it("lists jobs via knowledgeJobs and observes mock completed snapshots", async () => {
    let listener: ((snapshot: KnowledgeJobSnapshot) => void) | null = null;
    const listSnapshots = vi.fn(async () => [
      job({ jobId: "j1", status: "uploading", progress: 40 }),
    ]);
    const createDraft = vi.fn(async () =>
      job({ jobId: "j2", status: "queued", progress: 0 }),
    );
    const cancelJob = vi.fn(async ({ jobId }: { jobId: string }) =>
      job({ jobId, status: "cancelled", progress: 40 }),
    );
    const retryJob = vi.fn(async ({ jobId }: { jobId: string }) =>
      job({ jobId, status: "queued", progress: 0 }),
    );

    await act(async () => {
      render(
        React.createElement(KnowledgeUploadPanel, {
          knowledgeBaseId: "kb-1",
          baseName: "Alpha",
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          listSnapshots,
          createDraft,
          cancelJob,
          retryJob,
          onSnapshotChanged: (callback) => {
            listener = callback;
            return () => {
              listener = null;
            };
          },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-upload-queue")).toBeTruthy();
    });
    expect(listSnapshots).toHaveBeenCalled();

    await act(async () => {
      listener?.(job({ jobId: "j1", status: "completed", progress: 100 }));
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("knowledge-upload-job-j1").getAttribute("data-status"),
      ).toBe("completed");
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-upload-picker"));
    });
    expect(createDraft).toHaveBeenCalledWith({ knowledgeBaseId: "kb-1" });
  });

  it("hides the picker without a knowledge base and never owns a setInterval", async () => {
    const panelSrc = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../src/renderer/src/screens/Knowledge/features/file-job/KnowledgeUploadPanel.tsx",
      ),
      "utf8",
    );
    expect(panelSrc).not.toMatch(/setInterval\s*\(/);

    await act(async () => {
      render(
        React.createElement(KnowledgeUploadPanel, {
          knowledgeBaseId: "",
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          listSnapshots: async () => [],
        }),
      );
    });

    expect(screen.queryByTestId("knowledge-upload-picker")).toBeNull();
    expect(screen.queryByTestId("knowledge-upload-submit")).toBeNull();
  });

  it("disables picker in provider mode without createDraft", async () => {
    await act(async () => {
      render(
        React.createElement(KnowledgeUploadPanel, {
          knowledgeBaseId: "kb-1",
          baseName: "Alpha",
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          listSnapshots: async () => [],
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-upload-picker")).toBeDisabled();
    });
    expect(document.body.textContent).toContain(
      knowledgeEn.uploads.pickerDisabledProvider,
    );
  });

  it("locks the upload target to the required knowledge base", async () => {
    const createDraft = vi.fn(async ({ knowledgeBaseId }: { knowledgeBaseId?: string }) =>
      job({
        jobId: "j-lock",
        status: "queued",
        progress: 0,
        knowledgeBaseId: knowledgeBaseId ?? "unbound",
      }),
    );
    const pickFiles = vi.fn(async () => []);
    (
      window as unknown as {
        hermesAPI: { files: { pickFiles: typeof pickFiles } };
      }
    ).hermesAPI = { files: { pickFiles } };

    await act(async () => {
      render(
        React.createElement(KnowledgeUploadPanel, {
          knowledgeBaseId: "kb-42",
          baseName: "Locked Base",
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          listSnapshots: async () => [],
          createDraft,
          cancelJob: async ({ jobId }) =>
            job({ jobId, status: "cancelled", progress: 0 }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-upload-target").textContent).toContain(
        "Locked Base",
      );
    });
    expect(screen.getByTestId("knowledge-upload-target").tagName).toBe("P");
    expect(screen.queryByText(knowledgeEn.uploads.unboundTarget ?? "Unbound")).toBeNull();
    expect(screen.getByTestId("knowledge-upload-picker")).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-upload-picker"));
    });
    expect(createDraft).toHaveBeenCalledWith({ knowledgeBaseId: "kb-42" });
  });
});
