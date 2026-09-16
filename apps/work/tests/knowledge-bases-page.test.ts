// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeBasesPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage";
import { KnowledgeBaseDetailPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeBaseDetailPage";
import type {
  HermesKnowledgeBasesAPI,
  KnowledgeBaseSnapshot,
} from "../src/shared/knowledge/knowledge-base-ipc";

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
  };
}

function makeBasesApi(
  store: KnowledgeBaseSnapshot[],
): HermesKnowledgeBasesAPI {
  return {
    list: vi.fn(async () => ({
      items: [...store],
      total: store.length,
      page: 1,
      pageSize: 50,
    })),
    get: vi.fn(async ({ knowledgeBaseId }) => {
      const found = store.find((item) => item.id === knowledgeBaseId);
      if (!found) throw new Error("KNOWLEDGE_NOT_FOUND");
      return found;
    }),
    create: vi.fn(async (input) => {
      const created = base(`b${store.length + 1}`, input.name, input.visibility);
      store.push(created);
      return created;
    }),
    update: vi.fn(async (input) => {
      const existing = store.find((item) => item.id === input.knowledgeBaseId)!;
      existing.name = input.name ?? existing.name;
      existing.description =
        input.description === undefined ? existing.description : input.description;
      existing.visibility = input.visibility ?? existing.visibility;
      return existing;
    }),
    delete: vi.fn(async ({ knowledgeBaseId }) => {
      const index = store.findIndex((item) => item.id === knowledgeBaseId);
      if (index >= 0) store.splice(index, 1);
    }),
    listFiles: vi.fn(async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    })),
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
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-section-tab-settings"));
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

  it("toggles card/table views and opens the create dialog", async () => {
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

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-bases-view-table"));
    });
    expect(screen.getByTestId("knowledge-base-list").tagName).toBe("TABLE");

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-base-create"));
    });
    expect(screen.getByTestId("knowledge-base-create-title")).toBeTruthy();
  });
});
