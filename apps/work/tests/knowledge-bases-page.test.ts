// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeBasesPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage";
import { KnowledgeBaseDetailPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeBaseDetailPage";
import type { KnowledgeBaseSnapshot } from "../src/shared/knowledge/knowledge-base-ipc";
import { makeBasesApi } from "./helpers/knowledge-bases-api";

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

function base(
  id: string,
  name: string,
  visibility: KnowledgeBaseSnapshot["visibility"] = "private",
): KnowledgeBaseSnapshot {
  return {
    id,
    name,
    description: null,
    status: "active",
    visibility,
    ownerMemberId: `${id}-owner`,
    createdAt: "2026-01-02T00:00:00.000Z",
  };
}


describe("Knowledge Bases pages", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("supports list/search and typed create", async () => {
    const store = [base("b1", "Alpha Base"), base("b2", "Beta Base")];
    const bases = makeBasesApi(store);
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeBasesPage, {
          onNavigate,
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-list")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-base-owner-b1").textContent).toContain("b1-owner");
    expect(screen.getByTestId("knowledge-base-created-b1").textContent).toContain(
      "2026-01-02T00:00:00.000Z",
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-bases-search"), {
        target: { value: "Beta" },
      });
    });
    expect(screen.queryByTestId("knowledge-base-item-b1")).toBeNull();
    expect(screen.getByTestId("knowledge-base-item-b2")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-item-b2"));
    });
    expect(onNavigate).toHaveBeenCalledWith({
      page: "bases",
      params: { knowledgeBaseId: "b2" },
    });
  });

  it("saves detail through typed update, not patch.deleted", async () => {
    const store = [base("b2", "Beta Base")];
    const bases = makeBasesApi(store);

    await act(async () => {
      render(
        React.createElement(KnowledgeBaseDetailPage, {
          params: { knowledgeBaseId: "b2" },
          onBack: () => undefined,
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-detail")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-base-detail-owner").textContent).toContain("b2-owner");
    expect(screen.getByTestId("knowledge-base-detail-created").textContent).toContain(
      "2026-01-02T00:00:00.000Z",
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-section-tab-settings"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-title-input")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-base-title-input"), {
        target: { value: "Beta Updated" },
      });
      fireEvent.click(screen.getByTestId("knowledge-base-save"));
    });
    expect(bases.update).toHaveBeenCalled();
    expect(bases.delete).not.toHaveBeenCalled();
  });

  it("enables mutations in provider mode when capability is available", async () => {
    const bases = makeBasesApi([]);

    await act(async () => {
      render(
        React.createElement(KnowledgeBasesPage, {
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-create")).not.toBeDisabled();
    });
    expect(screen.getByTestId("knowledge-base-list-empty")).toBeTruthy();
  });

  it("disables mutations when the provider is unavailable", async () => {
    const bases = makeBasesApi([base("b1", "Nope")]);

    await act(async () => {
      render(
        React.createElement(KnowledgeBasesPage, {
          capability: {
            available: false,
            status: "blocked_provider_unavailable",
          },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("knowledge-bases-page").getAttribute("data-state"),
      ).toBe("unavailable");
    });
    expect(screen.queryByTestId("knowledge-base-create")).toBeNull();
  });

  it("keeps a card-only list and opens the create dialog", async () => {
    const bases = makeBasesApi([base("b1", "Alpha Base")]);

    await act(async () => {
      render(
        React.createElement(KnowledgeBasesPage, {
          onNavigate: () => undefined,
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-item-b1")).toBeTruthy();
    });
    expect(screen.queryByTestId("knowledge-bases-view-table")).toBeNull();
    expect(screen.queryByTestId("knowledge-bases-view-card")).toBeNull();
    expect(screen.getByTestId("knowledge-base-list").tagName).toBe("DIV");

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-create"));
    });
    expect(screen.getByTestId("knowledge-base-create-title")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("keeps create-dialog focus inside the overlay and closes on Escape", async () => {
    const bases = makeBasesApi([base("b1", "Alpha Base")]);

    await act(async () => {
      render(
        React.createElement(KnowledgeBasesPage, {
          onNavigate: () => undefined,
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-create")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-create"));
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    await act(async () => {
      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("opens a keyboard-accessible delete alertdialog from Settings", async () => {
    const store = [base("b2", "Beta Base")];
    const bases = makeBasesApi(store);

    await act(async () => {
      render(
        React.createElement(KnowledgeBaseDetailPage, {
          params: { knowledgeBaseId: "b2" },
          onBack: () => undefined,
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-detail")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-section-tab-settings"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-delete")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-delete"));
    });

    const alert = screen.getByRole("alertdialog");
    expect(alert).toBeTruthy();
    expect(alert.querySelector("button")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(alert, { key: "Escape", code: "Escape" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(bases.delete).not.toHaveBeenCalled();
  });

  it("opens a locked upload drawer and refreshes Documents on close", async () => {
    const store = [base("b2", "Beta Base")];
    const bases = makeBasesApi(store);
    const onNavigate = vi.fn();
    const createDraft = vi.fn(async () => ({
      jobId: "j-drawer",
      knowledgeBaseId: "b2",
      status: "queued" as const,
      attempt: 1,
      partition: {
        workProfileId: "wp",
        authSubject: "user",
        tenantScope: { kind: "personal" as const },
      },
      dataMode: "provider" as const,
      synthetic: false,
      progress: 0,
      updatedAt: new Date().toISOString(),
    }));

    await act(async () => {
      render(
        React.createElement(KnowledgeBaseDetailPage, {
          params: { knowledgeBaseId: "b2" },
          onNavigate,
          onBack: () => undefined,
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          bases,
          listSnapshots: async () => [],
          createDraft,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-upload")).not.toBeDisabled();
    });
    expect(bases.listFiles).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-upload"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-upload-drawer")).toBeTruthy();
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("knowledge-upload-target").textContent).toContain(
      "Beta Base",
    );
    expect(screen.queryByRole("combobox")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-upload-picker"));
    });
    expect(createDraft).toHaveBeenCalledWith({ knowledgeBaseId: "b2" });

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("knowledge-upload-drawer"), {
        key: "Escape",
        code: "Escape",
      });
    });
    await waitFor(() => {
      expect(bases.listFiles).toHaveBeenCalledTimes(2);
    });
  });

  it("disables Upload while the base is provisioning", async () => {
    const store = [{ ...base("b2", "Beta Base"), status: "provisioning" as const }];
    const bases = makeBasesApi(store);

    await act(async () => {
      render(
        React.createElement(KnowledgeBaseDetailPage, {
          params: { knowledgeBaseId: "b2" },
          onNavigate: vi.fn(),
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-detail")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-base-upload")).toBeDisabled();
  });

  it("shows Documents rows and source lifecycle actions", async () => {
    const store = [base("b2", "Beta Base")];
    const files = [
      {
        id: "sf-1",
        knowledgeBaseId: "b2",
        fileName: "notes.pdf",
        status: "active" as const,
        activeVersionId: "ver-1",
        lastError: null,
        archivedAt: null,
        ownerMemberId: "file-owner-1",
        createdAt: "2026-01-03T00:00:00.000Z",
      },
    ];
    const bases = makeBasesApi(store, {
      files,
      versions: [
        {
          id: "ver-1",
          sourceFileId: "sf-1",
          versionNo: 1,
          parseStatus: "active",
        },
        {
          id: "ver-2",
          sourceFileId: "sf-1",
          versionNo: 2,
          parseStatus: "active",
        },
      ],
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeBaseDetailPage, {
          params: { knowledgeBaseId: "b2" },
          onNavigate: vi.fn(),
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-file-sf-1")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-base-file-version-sf-1").textContent).toBe(
      "ver-1",
    );
    expect(screen.getByTestId("knowledge-base-file-owner-sf-1").textContent).toBe(
      "file-owner-1",
    );
    expect(screen.getByTestId("knowledge-base-file-created-sf-1").textContent).toBe(
      "2026-01-03T00:00:00.000Z",
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-file-activate-sf-1"));
    });
    await waitFor(() => {
      expect(bases.activateFileVersion).toHaveBeenCalledWith({
        sourceFileId: "sf-1",
        versionId: "ver-2",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-file-reparse-sf-1"));
    });
    await waitFor(() => {
      expect(bases.reparseFile).toHaveBeenCalledWith({ sourceFileId: "sf-1" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-file-archive-sf-1"));
    });
    await waitFor(() => {
      expect(bases.archiveFile).toHaveBeenCalledWith({ sourceFileId: "sf-1" });
    });
  });

  it("marks retrieval-ready only when chunk build and retrieval are ready", async () => {
    const store = [base("b2", "Beta Base")];
    const bases = makeBasesApi(store, {
      files: [
        {
          id: "sf-1",
          knowledgeBaseId: "b2",
          fileName: "notes.pdf",
          status: "active",
          activeVersionId: "ver-1",
        },
      ],
      indexes: [
        {
          indexType: "chunk",
          buildStatus: "ready",
          retrievalStatus: "unavailable",
        },
      ],
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeBaseDetailPage, {
          params: { knowledgeBaseId: "b2" },
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-retrieval-ready").textContent).toBe(
        knowledgeEn.bases.indexedNotRetrievalReady,
      );
    });
    expect(
      screen.getByTestId("knowledge-base-retrieval-ready").getAttribute("data-ready"),
    ).toBe("false");
    expect(document.body.textContent).not.toMatch(/dataset_id|ragflow_/);

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-build"));
    });
    expect(bases.startBuild).toHaveBeenCalledWith({
      knowledgeBaseId: "b2",
      indexTypes: ["chunk"],
    });
  });

  it("reloads Documents when Detail remounts after Uploads", async () => {
    const store = [base("b2", "Beta Base")];
    const bases = makeBasesApi(store);
    const props = {
      params: { knowledgeBaseId: "b2" },
      capability: { available: true, status: "available" as const },
      mode: {
        dataMode: "provider" as const,
        allowSyntheticData: false,
        configSource: "default",
      },
      bases,
    };

    let view = render(React.createElement(KnowledgeBaseDetailPage, props));
    await waitFor(() => {
      expect(bases.listFiles).toHaveBeenCalledTimes(1);
    });
    view.unmount();

    view = render(React.createElement(KnowledgeBaseDetailPage, props));
    await waitFor(() => {
      expect(bases.listFiles).toHaveBeenCalledTimes(2);
    });
    view.unmount();
  });
});


