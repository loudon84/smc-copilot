// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeDocumentsPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage";
import { KnowledgeDocumentDetailPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentDetailPage";
import type {
  KnowledgeBaseFileSnapshot,
  KnowledgeBaseSnapshot,
} from "../src/shared/knowledge/knowledge-base-ipc";
import { makeBasesApi } from "./helpers/knowledge-bases-api";

vi.mock("@open-file-viewer/react", () => ({
  FileViewer: () => React.createElement("div", { "data-testid": "mock-ofv" }),
}));
vi.mock("@open-file-viewer/core", () => ({
  textPlugin: () => ({}),
  imagePlugin: () => ({}),
  pdfPlugin: () => ({}),
  officePlugin: () => ({}),
}));
vi.mock("@open-file-viewer/core/style.css", () => ({}));
vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "/mock-pdf.worker.mjs",
}));

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

function kb(
  id: string,
  name: string,
  status: KnowledgeBaseSnapshot["status"] = "active",
): KnowledgeBaseSnapshot {
  return {
    id,
    name,
    description: null,
    status,
    visibility: "private",
    ownerMemberId: `${id}-owner`,
    createdAt: "2026-01-02T00:00:00.000Z",
  };
}

function file(
  id: string,
  knowledgeBaseId: string,
  fileName: string,
  extras: Partial<KnowledgeBaseFileSnapshot> = {},
): KnowledgeBaseFileSnapshot {
  return {
    id,
    knowledgeBaseId,
    fileName,
    status: "active",
    activeVersionId: `${id}-v1`,
    archivedAt: null,
    ownerMemberId: `${id}-owner`,
    createdAt: "2026-01-03T00:00:00.000Z",
    ...extras,
  };
}

const providerMode = {
  dataMode: "provider" as const,
  allowSyntheticData: false,
  configSource: "default" as const,
};

const available = { available: true as const, status: "available" as const };

describe("Knowledge Documents page", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not list files when Knowledge is unavailable", async () => {
    const bases = makeBasesApi([kb("b1", "Alpha")], {
      files: [file("sf-1", "b1", "handbook.pdf")],
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentsPage, {
          capability: {
            available: false,
            status: "blocked_provider_unavailable",
          },
          mode: providerMode,
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-documents-page").getAttribute("data-state")).toBe(
        "unavailable",
      );
    });
    expect(bases.list).not.toHaveBeenCalled();
    expect(bases.listFiles).not.toHaveBeenCalled();
    expect(screen.queryByTestId("knowledge-documents-base")).toBeNull();
  });

  it("lists files from all knowledge bases by default", async () => {
    const bases = makeBasesApi([kb("b1", "Alpha"), kb("b2", "Beta")], {
      files: [
        file("sf-1", "b1", "handbook.pdf"),
        file("sf-2", "b2", "other.pdf"),
      ],
    });
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentsPage, {
          capability: available,
          mode: providerMode,
          bases,
          onNavigate,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-list")).toBeTruthy();
    });
    expect(bases.listFiles).toHaveBeenCalledWith({ knowledgeBaseId: "b1" });
    expect(bases.listFiles).toHaveBeenCalledWith({ knowledgeBaseId: "b2" });
    expect(screen.getByText("handbook.pdf")).toBeTruthy();
    expect(screen.getByText("other.pdf")).toBeTruthy();
    expect(screen.getByTestId("knowledge-document-base-sf-1").textContent).toBe("Alpha");
    expect(screen.getByTestId("knowledge-document-base-sf-2").textContent).toBe("Beta");
    expect(screen.getByTestId("knowledge-documents-base").closest(".flex-nowrap")).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("lists files for the routed base and opens detail with both ids", async () => {
    const bases = makeBasesApi([kb("b1", "Alpha"), kb("b2", "Beta")], {
      files: [
        file("sf-1", "b1", "handbook.pdf"),
        file("sf-2", "b2", "other.pdf"),
      ],
    });
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentsPage, {
          params: { knowledgeBaseId: "b1" },
          capability: available,
          mode: providerMode,
          bases,
          onNavigate,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-list")).toBeTruthy();
    });
    expect(bases.listFiles).toHaveBeenCalledWith({ knowledgeBaseId: "b1" });
    expect(screen.getByText("handbook.pdf")).toBeTruthy();
    expect(screen.queryByText("other.pdf")).toBeNull();
    expect(screen.getByTestId("knowledge-document-base-sf-1").textContent).toBe("Alpha");
    expect(screen.getByTestId("knowledge-document-owner-sf-1").textContent).toBe(
      "sf-1-owner",
    );
    expect(screen.getByTestId("knowledge-document-created-sf-1").textContent).toBe(
      "2026-01-03T00:00:00.000Z",
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-item-sf-1"));
    });
    expect(onNavigate).toHaveBeenCalledWith({
      page: "documents",
      params: { knowledgeBaseId: "b1", documentId: "sf-1" },
    });
  });

  it("shows provider file snapshots in Info/Versions/Parse instead of draft copy", async () => {
    const handbook = file("sf-1", "b1", "handbook.pdf", {
      mimeType: "application/pdf",
      lastError: null,
    });
    const bases = makeBasesApi([kb("b1", "Alpha")], {
      files: [handbook],
      versions: [
        {
          id: "sf-1-v1",
          sourceFileId: "sf-1",
          versionNo: 1,
          parseStatus: "active",
          createdAt: "2026-01-04T00:00:00.000Z",
          uploadedByMemberId: "uploader-1",
        },
        {
          id: "sf-1-v2",
          sourceFileId: "sf-1",
          versionNo: 2,
          parseStatus: "pending",
          createdAt: "2026-01-05T00:00:00.000Z",
          uploadedByMemberId: "uploader-2",
        },
      ],
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentDetailPage, {
          params: { knowledgeBaseId: "b1", documentId: "sf-1" },
          capability: available,
          mode: providerMode,
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-detail-page")).toBeTruthy();
      expect(screen.getByTestId("knowledge-document-detail")).toBeTruthy();
    });
    expect(screen.getByTestId("document-detail-source-pane")).toBeTruthy();
    expect(screen.getByTestId("document-detail-chunk-pane")).toBeTruthy();
    expect(screen.getByTestId("knowledge-document-preview")).toBeTruthy();
    expect(screen.getByTestId("knowledge-chunk-panel")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-open-info"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-info-drawer")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-document-version").textContent).toBe("sf-1-v1");
    expect(screen.getByTestId("knowledge-document-status").textContent).toBe(
      knowledgeEn.documents.statusActive,
    );
    expect(screen.getByTestId("knowledge-document-base").textContent).toBe("Alpha");
    expect(screen.getByTestId("knowledge-document-owner").textContent).toBe("sf-1-owner");
    expect(screen.getByTestId("knowledge-document-created").textContent).toBe(
      "2026-01-03T00:00:00.000Z",
    );
    expect(screen.getByTestId("knowledge-document-parse").textContent).toBe("active");

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-open-versions"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-versions-drawer")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-document-version-created-sf-1-v1").textContent).toContain(
      "2026-01-04T00:00:00.000Z",
    );
    expect(
      screen.getByTestId("knowledge-document-version-uploader-sf-1-v1").textContent,
    ).toContain("uploader-1");
    expect(screen.getByTestId("knowledge-document-version-sf-1-v1").getAttribute("data-active")).toBe(
      "true",
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-open-parse"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-parse-drawer")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-document-parse-sf-1-v2").textContent).toContain(
      "pending",
    );
    expect(screen.getByTestId("knowledge-document-info").textContent).not.toMatch(
      /No version history|Parse metadata is not returned/i,
    );
    const permission = screen.getByTestId("knowledge-document-permission");
    expect(permission.getAttribute("data-display-only")).toBe("true");
    expect(screen.getByTestId("knowledge-document-permission-note").textContent).toMatch(
      /display-only/i,
    );
    expect(permission.textContent).not.toMatch(
      /grants access|authorized for File|viewer \/ private/i,
    );
  });

  it("activates, reparses, and archives through Base IPC", async () => {
    const handbook = file("sf-1", "b1", "handbook.pdf");
    const bases = makeBasesApi([kb("b1", "Alpha")], {
      files: [handbook],
      versions: [
        {
          id: "sf-1-v1",
          sourceFileId: "sf-1",
          versionNo: 1,
          parseStatus: "active",
        },
        {
          id: "sf-1-v2",
          sourceFileId: "sf-1",
          versionNo: 2,
          parseStatus: "pending",
        },
      ],
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentDetailPage, {
          params: { knowledgeBaseId: "b1", documentId: "sf-1" },
          capability: available,
          mode: providerMode,
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-open-versions")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-open-versions"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-activate-sf-1-v2")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-activate-sf-1-v2"));
    });
    await waitFor(() => {
      expect(bases.activateFileVersion).toHaveBeenCalledWith({
        sourceFileId: "sf-1",
        versionId: "sf-1-v2",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-more"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-reparse")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-reparse"));
    });
    await waitFor(() => {
      expect(bases.reparseFile).toHaveBeenCalledWith({ sourceFileId: "sf-1" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-more"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-archive")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-archive"));
    });
    await waitFor(() => {
      expect(bases.archiveFile).toHaveBeenCalledWith({ sourceFileId: "sf-1" });
    });
  });

  it("disables file mutations when the base is provisioning", async () => {
    const handbook = file("sf-1", "b1", "handbook.pdf");
    const bases = makeBasesApi([kb("b1", "Alpha", "provisioning")], {
      files: [handbook],
      versions: [
        {
          id: "sf-1-v1",
          sourceFileId: "sf-1",
          versionNo: 1,
          parseStatus: "active",
        },
      ],
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentDetailPage, {
          params: { knowledgeBaseId: "b1", documentId: "sf-1" },
          capability: available,
          mode: providerMode,
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-more")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-more"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-reparse")).toBeDisabled();
    });
    expect(screen.getByTestId("knowledge-document-archive")).toBeDisabled();
    expect(screen.getByTestId("knowledge-document-delete")).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-open-versions"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-activate-sf-1-v1")).toBeDisabled();
    });
  });

  it("deletes a file after confirm and returns to the base list", async () => {
    const handbook = file("sf-1", "b1", "handbook.pdf");
    const bases = makeBasesApi([kb("b1", "Alpha")], {
      files: [handbook],
      versions: [
        {
          id: "sf-1-v1",
          sourceFileId: "sf-1",
          versionNo: 1,
          parseStatus: "active",
        },
      ],
    });
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentDetailPage, {
          params: { knowledgeBaseId: "b1", documentId: "sf-1" },
          capability: available,
          mode: providerMode,
          bases,
          onNavigate,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-more")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-more"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-delete")).toBeEnabled();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-delete"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-document-delete-confirm"));
    });
    await waitFor(() => {
      expect(bases.deleteFile).toHaveBeenCalledWith({ sourceFileId: "sf-1" });
    });
    expect(onNavigate).toHaveBeenCalledWith({
      page: "documents",
      params: { knowledgeBaseId: "b1" },
    });
  });

  it("shows filters/detail/permission display-only and preview when ManagedFile exists", async () => {
    const handbook = file("sf-1", "b1", "Handbook");
    const bases = makeBasesApi([kb("b1", "Alpha")], {
      files: [handbook],
      versions: [
        {
          id: "sf-1-v1",
          sourceFileId: "sf-1",
          versionNo: 1,
          parseStatus: "active",
        },
      ],
    });
    const loadPreview = vi.fn(async () => ({ ok: true as const }));

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentDetailPage, {
          params: { documentId: "sf-1" },
          capability: available,
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          bases,
          resolveManagedFileId: () => "file-1",
          loadPreview,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-detail")).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-preview-ready")).toBeTruthy();
    });
    expect(loadPreview).toHaveBeenCalledWith("file-1");
  });

  it("surfaces preview unavailable/error without crashing the host", async () => {
    const handbook = file("sf-1", "b1", "Handbook");
    const bases = makeBasesApi([kb("b1", "Alpha")], {
      files: [handbook],
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentDetailPage, {
          params: { documentId: "sf-1" },
          capability: available,
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
      expect(
        screen.getByTestId("knowledge-document-preview-unavailable"),
      ).toBeTruthy();
    });

    cleanup();
    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentDetailPage, {
          params: { documentId: "sf-1" },
          capability: available,
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          bases,
          resolveManagedFileId: () => "file-bad",
          loadPreview: async () => ({ ok: false, error: "boom" }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-preview-error").textContent).toContain(
        "boom",
      );
    });
  });
});
