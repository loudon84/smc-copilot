// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeDocumentsPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeDocumentsPage";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeFacadeEntitySnapshot,
} from "../src/shared/knowledge/knowledge-job-ipc";

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

function doc(
  id: string,
  title: string,
  visibility = "private",
): KnowledgeFacadeEntitySnapshot {
  return {
    id,
    kind: "document",
    title,
    dataMode: "mock",
    permission: { role: "viewer", visibility },
    partition: {
      workProfileId: "wp",
      authSubject: "user",
      tenantScope: { kind: "personal" },
    },
  };
}

describe("Knowledge Documents page (V04)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows filters/detail/permission display-only and preview when ManagedFile exists", async () => {
    const entity = doc("d1", "Handbook");
    const facade: HermesKnowledgeFacadeAPI = {
      listEntities: vi.fn(async () => [entity, doc("d2", "Other", "shared")]),
      getEntity: vi.fn(async () => entity),
      mutateEntity: vi.fn(async () => entity),
    };
    const loadPreview = vi.fn(async () => ({ ok: true as const }));

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentsPage, {
          params: { documentId: "d1" },
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          facade,
          resolveManagedFileId: () => "file-1",
          loadPreview,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-detail")).toBeTruthy();
    });
    const permission = screen.getByTestId("knowledge-document-permission");
    expect(permission.getAttribute("data-display-only")).toBe("true");
    expect(screen.getByTestId("knowledge-document-permission-note").textContent).toContain(
      knowledgeEn.documents.permissionDisplayOnly,
    );
    expect(screen.getByTestId("knowledge-document-permission-note").textContent).toMatch(
      /display-only/i,
    );
    expect(screen.getByTestId("knowledge-document-permission").textContent).not.toMatch(
      /grants access|authorized for File|authorized for Chat/i,
    );
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-preview-ready")).toBeTruthy();
    });
    expect(loadPreview).toHaveBeenCalledWith("file-1");
  });

  it("surfaces preview unavailable/error without crashing the host", async () => {
    const entity = doc("d1", "Handbook");
    const facade: HermesKnowledgeFacadeAPI = {
      listEntities: vi.fn(async () => [entity]),
      getEntity: vi.fn(async () => entity),
      mutateEntity: vi.fn(async () => entity),
    };

    await act(async () => {
      render(
        React.createElement(KnowledgeDocumentsPage, {
          params: { documentId: "d1" },
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          facade,
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
        React.createElement(KnowledgeDocumentsPage, {
          params: { documentId: "d1" },
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          facade,
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
