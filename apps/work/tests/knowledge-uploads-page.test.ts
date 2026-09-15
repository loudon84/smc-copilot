// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeUploadsPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage";
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
    knowledgeBaseId: "unbound",
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

describe("Knowledge Uploads page (V05)", () => {
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
        React.createElement(KnowledgeUploadsPage, {
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
    expect(createDraft).toHaveBeenCalled();
  });

  it("disables picker in provider mode and never owns a setInterval progress timer", async () => {
    const pageSrc = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../src/renderer/src/screens/Knowledge/pages/KnowledgeUploadsPage.tsx",
      ),
      "utf8",
    );
    expect(pageSrc).not.toMatch(/setInterval\s*\(/);

    await act(async () => {
      render(
        React.createElement(KnowledgeUploadsPage, {
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
    expect(screen.queryByTestId("knowledge-upload-submit")).toBeNull();
    expect(document.body.textContent).toContain(
      knowledgeEn.uploads.pickerDisabledProvider,
    );
  });
});
