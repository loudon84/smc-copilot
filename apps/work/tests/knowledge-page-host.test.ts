// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import {
  KNOWLEDGE_ROUTE_PAGES,
  type KnowledgePageId,
} from "../src/renderer/src/screens/Knowledge/knowledge-route-descriptor";
import { KnowledgePages } from "../src/renderer/src/screens/Knowledge/KnowledgePages";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../src/shared/knowledge/knowledge-job-ipc";
import type { HermesKnowledgeBasesAPI } from "../src/shared/knowledge/knowledge-base-ipc";
import type { HermesKnowledgeSetsAPI } from "../src/shared/knowledge/knowledge-set-ipc";
import { makeBasesApi, unusedKnowledgeBaseOps } from "./helpers/knowledge-bases-api";
import { makeSetsApi } from "./helpers/knowledge-sets-api";

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

function mockJobs(options: {
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot;
  facade?: HermesKnowledgeFacadeAPI;
  bases?: HermesKnowledgeBasesAPI;
  sets?: HermesKnowledgeSetsAPI;
}): void {
  const capability =
    options.capability === undefined
      ? ({ available: false, status: "blocked_provider_unavailable" } as const)
      : options.capability;
  const mode =
    options.mode ??
    ({
      dataMode: "provider",
      allowSyntheticData: false,
      configSource: "default",
    } as const);

  const facade =
    options.facade ??
    ({
      listEntities: vi.fn(async () => []),
      getEntity: vi.fn(async () => null),
      mutateEntity: vi.fn(async () => {
        throw new Error("KNOWLEDGE_FACADE_UNAVAILABLE");
      }),
    } satisfies HermesKnowledgeFacadeAPI);

  const bases =
    options.bases ??
    ({
      list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
      get: vi.fn(async () => {
        throw new Error("KNOWLEDGE_NOT_FOUND");
      }),
      create: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      update: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      delete: vi.fn(async () => undefined),
      listFiles: vi.fn(async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      })),
      ...unusedKnowledgeBaseOps(),
    } satisfies HermesKnowledgeBasesAPI);

  const sets =
    options.sets ??
    ({
      list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
      get: vi.fn(async () => {
        throw new Error("KNOWLEDGE_NOT_FOUND");
      }),
      create: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      update: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      bindBase: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      unbindBase: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      listProfiles: vi.fn(async () => []),
      createProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      getProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_NOT_FOUND");
      }),
      updateProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      publishProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      rollbackProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
    } satisfies HermesKnowledgeSetsAPI);

  (
    window as unknown as {
      hermesAPI: {
        knowledgeJobs: {
          getCapability: ReturnType<typeof vi.fn>;
          getMode: ReturnType<typeof vi.fn>;
          facade: HermesKnowledgeFacadeAPI;
          bases: HermesKnowledgeBasesAPI;
          sets: HermesKnowledgeSetsAPI;
          listSnapshots: ReturnType<typeof vi.fn>;
          createDraft: ReturnType<typeof vi.fn>;
          onSnapshotChanged: () => () => undefined;
        };
      };
    }
  ).hermesAPI = {
    knowledgeJobs: {
      getCapability: vi.fn(async () => {
        if (!capability) throw new Error("capability missing");
        return capability;
      }),
      getMode: vi.fn(async () => mode),
      facade,
      bases,
      sets,
      listSnapshots: vi.fn(async () => []),
      createDraft: vi.fn(async () => {
        throw new Error("createDraft blocked");
      }),
      onSnapshotChanged: () => () => undefined,
    },
  };
}

describe("Knowledge page host (V01)", () => {
  beforeEach(() => {
    mockJobs({
      capability: { available: true, status: "available" },
      mode: {
        dataMode: "mock",
        allowSyntheticData: true,
        configSource: "env",
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { hermesAPI?: unknown }).hermesAPI;
  });

  it("passes route-scope params into the active page slot", async () => {
    const entities = [
      {
        id: "base-42",
        kind: "base" as const,
        dataMode: "mock" as const,
        partition: {
          workProfileId: "wp",
          authSubject: "user",
          tenantScope: { kind: "personal" as const },
        },
        title: "Base Forty Two",
      },
    ];
    mockJobs({
      capability: { available: true, status: "available" },
      mode: {
        dataMode: "mock",
        allowSyntheticData: true,
        configSource: "env",
      },
      facade: {
        listEntities: vi.fn(async () => entities),
        getEntity: vi.fn(async () => entities[0]),
        mutateEntity: vi.fn(async () => entities[0]),
      },
      bases: {
        list: vi.fn(async () => ({
          items: [
            {
              id: "base-42",
              name: "Base Forty Two",
              description: null,
              status: "active",
              visibility: "private",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        })),
        get: vi.fn(async () => ({
          id: "base-42",
          name: "Base Forty Two",
          description: null,
          status: "active",
          visibility: "private",
        })),
        create: vi.fn(async () => {
          throw new Error("unused");
        }),
        update: vi.fn(async () => {
          throw new Error("unused");
        }),
        delete: vi.fn(async () => undefined),
        listFiles: vi.fn(async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 50,
        })),
        ...unusedKnowledgeBaseOps(),
      },
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "bases",
          params: { knowledgeBaseId: "base-42" },
          onNavigate: () => undefined,
          onBack: () => undefined,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-detail-id").textContent).toBe(
        "base-42",
      );
    });
    expect(window.location.href).not.toContain("base-42");
  });

  it("switches across five Knowledge pages without a Profile or Uploads slot", async () => {
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "home",
          params: {},
          onNavigate,
        }),
      );
    });

    const nav = screen.getByTestId("knowledge-module-nav");
    expect(nav).toBeTruthy();
    expect(nav.className).toContain("memory-tabs");
    expect(screen.getByTestId("knowledge-nav-home").className).toContain(
      "memory-tab",
    );
    expect(screen.queryByTestId("knowledge-nav-profile")).toBeNull();
    expect(screen.queryByTestId("knowledge-nav-preferences")).toBeNull();
    expect(screen.queryByTestId("knowledge-nav-uploads")).toBeNull();

    for (const page of KNOWLEDGE_ROUTE_PAGES) {
      expect(screen.getByTestId(`knowledge-nav-${page}`)).toBeTruthy();
    }

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-nav-bases"));
    });
    expect(onNavigate).toHaveBeenCalledWith({ page: "bases", params: {} });

    for (const page of KNOWLEDGE_ROUTE_PAGES) {
      cleanup();
      await act(async () => {
        render(
          React.createElement(KnowledgePages, {
            page: page as KnowledgePageId,
            params: {},
            onNavigate,
          }),
        );
      });
      await waitFor(() => {
        const panel = screen.getByTestId(`knowledge-page-${page}`);
        expect(panel.getAttribute("data-knowledge-host")).toBe("true");
        expect(panel.getAttribute("data-page")).toBe(page);
      });
    }
  });

  it("fail-closes at host level when provider capability is unavailable", async () => {
    mockJobs({
      capability: {
        available: false,
        status: "blocked_provider_unavailable",
      },
      mode: {
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      },
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "documents",
          params: {},
        }),
      );
    });

    await waitFor(() => {
      const panel = screen.getByTestId("knowledge-page-documents");
      expect(panel.getAttribute("data-state")).toBe("unavailable");
      expect(panel.textContent).toContain(knowledgeEn.unavailableTitle);
    });
  });

  it("does not write window history when navigating via callbacks", async () => {
    const hrefBefore = window.location.href;
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "home",
          params: {},
          onNavigate,
        }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-nav-chat"));
    });

    expect(onNavigate).toHaveBeenCalled();
    expect(window.location.href).toBe(hrefBefore);
  });

  it("routes documents documentId to the detail page", async () => {
    const bases = makeBasesApi(
      [
        {
          id: "b1",
          name: "Alpha",
          description: null,
          status: "active",
          visibility: "private",
        },
      ],
      {
        files: [
          {
            id: "sf-1",
            knowledgeBaseId: "b1",
            fileName: "handbook.pdf",
            status: "active",
            activeVersionId: "sf-1-v1",
            archivedAt: null,
          },
        ],
      },
    );
    mockJobs({
      capability: { available: true, status: "available" },
      mode: {
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      },
      bases,
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "documents",
          params: { knowledgeBaseId: "b1", documentId: "sf-1" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-detail-page")).toBeTruthy();
    });
    expect(screen.queryByTestId("knowledge-documents-page")).toBeNull();
    expect(screen.getByTestId("knowledge-document-detail")).toBeTruthy();
  });

  it("routes sets knowledgeSetId to the detail page", async () => {
    const sets = makeSetsApi([
      {
        id: "set-9",
        name: "Set Nine",
        description: null,
        status: "active",
        visibility: "organization",
        usageCount: 0,
        knowledgeBases: [],
      },
    ]);
    mockJobs({
      capability: { available: true, status: "available" },
      mode: {
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      },
      sets,
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "sets",
          params: { knowledgeSetId: "set-9" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-detail")).toBeTruthy();
    });
    expect(screen.queryByTestId("knowledge-sets-page")).toBeNull();
  });
});
