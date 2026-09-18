/**
 * TRACE-ONLY verification for Knowledge document open → preview resolve.
 *
 * Target incident: source_file_id ce68050c-b99d-4041-af44-577da02a0a6d
 * Symptom: downloadSourceFile OK, then IPC resolve-document-preview throws UNIQUE.
 *
 * No production code changes — contracts asserted here.
 */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeDocumentsPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage";
import { KnowledgeDocumentDetailPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentDetailPage";
import { makeBasesApi } from "./helpers/knowledge-bases-api";
import type { KnowledgeBaseFileSnapshot } from "../src/shared/knowledge/knowledge-base-ipc";

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

const INCIDENT_SOURCE_FILE_ID = "ce68050c-b99d-4041-af44-577da02a0a6d";

function file(
  id: string,
  knowledgeBaseId: string,
  fileName: string,
): KnowledgeBaseFileSnapshot {
  return {
    id,
    knowledgeBaseId,
    fileName,
    status: "active",
    mimeType: "text/markdown",
    activeVersionId: `${id}-v1`,
    ownerMemberId: null,
    createdAt: "2026-09-18T00:00:00.000Z",
  };
}

function kb(id: string, name: string) {
  return {
    id,
    name,
    status: "active" as const,
    description: null,
    ownerMemberId: null,
    createdAt: null,
    updatedAt: null,
  };
}

const available = {
  available: true,
  status: "ready" as const,
};

describe("TRACE Knowledge list → detail → preview (no URL handoff)", () => {
  it("Open from list passes only knowledgeBaseId + documentId (no download URL)", async () => {
    const handbook = file(INCIDENT_SOURCE_FILE_ID, "b1", "README.md");
    const bases = makeBasesApi([kb("b1", "Alpha")], { files: [handbook] });
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentsPage, {
          capability: available,
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          bases,
          onNavigate,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByTestId(`knowledge-document-item-${INCIDENT_SOURCE_FILE_ID}`),
      ).toBeTruthy();
    });

    await act(async () => {
      screen
        .getByTestId(`knowledge-document-item-${INCIDENT_SOURCE_FILE_ID}`)
        .click();
    });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    const target = onNavigate.mock.calls[0]?.[0] as {
      page: string;
      params: Record<string, string>;
    };
    expect(target.page).toBe("documents");
    expect(target.params).toEqual({
      knowledgeBaseId: "b1",
      documentId: INCIDENT_SOURCE_FILE_ID,
    });
    expect(Object.keys(target.params).sort()).toEqual([
      "documentId",
      "knowledgeBaseId",
    ]);
    expect(target.params).not.toHaveProperty("url");
    expect(target.params).not.toHaveProperty("downloadUrl");
    expect(JSON.stringify(target)).not.toMatch(/http/i);
  });

  it("Detail preview invokes resolveDocumentPreview with sourceFileId only (no URL field)", async () => {
    const handbook = file(INCIDENT_SOURCE_FILE_ID, "b1", "README.md");
    const resolveDocumentPreview = vi.fn(async () => ({
      managedFileId: "mf-trace-1",
    }));
    const bases = makeBasesApi([kb("b1", "Alpha")], {
      files: [handbook],
      versions: [
        {
          id: `${INCIDENT_SOURCE_FILE_ID}-v1`,
          sourceFileId: INCIDENT_SOURCE_FILE_ID,
          versionNo: 1,
          parseStatus: "active",
        },
      ],
    });
    bases.resolveDocumentPreview = resolveDocumentPreview;

    const getPreview = vi.fn(async () => ({
      fileId: "mf-trace-1",
      type: "markdown" as const,
      title: "README.md",
      mime: "text/markdown",
      content: "# ok",
      canOpenExternal: false,
      canSaveAs: false,
      canCopyText: true,
      canAddToContext: false,
      canRetryParse: false,
    }));
    vi.stubGlobal("hermesAPI", {
      files: { getPreview },
      knowledgeJobs: { bases },
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentDetailPage, {
          params: {
            knowledgeBaseId: "b1",
            documentId: INCIDENT_SOURCE_FILE_ID,
          },
          capability: available,
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "env",
          },
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(resolveDocumentPreview).toHaveBeenCalled();
    });

    const input = resolveDocumentPreview.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(input.sourceFileId).toBe(INCIDENT_SOURCE_FILE_ID);
    expect(input).toHaveProperty("activeVersionId");
    expect(input).toHaveProperty("fileName", "README.md");
    expect(input).not.toHaveProperty("url");
    expect(input).not.toHaveProperty("downloadUrl");
    expect(input).not.toHaveProperty("path");
  });
});
