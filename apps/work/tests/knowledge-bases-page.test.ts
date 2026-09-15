// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeBasesPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeBasesPage";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeFacadeEntitySnapshot,
  KnowledgeFacadeMutateInput,
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

function base(id: string, title: string): KnowledgeFacadeEntitySnapshot {
  return {
    id,
    kind: "base",
    title,
    dataMode: "mock",
    partition: {
      workProfileId: "wp",
      authSubject: "user",
      tenantScope: { kind: "personal" },
    },
  };
}

describe("Knowledge Bases page (V03)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("supports list/detail/search and mock mutate affordances", async () => {
    const store = [base("b1", "Alpha Base"), base("b2", "Beta Base")];
    const mutateEntity = vi.fn(async (input: KnowledgeFacadeMutateInput) => {
      if (input.entityId) {
        const existing = store.find((item) => item.id === input.entityId)!;
        const updated = {
          ...existing,
          title: String(input.patch?.title ?? existing.title),
        };
        Object.assign(existing, updated);
        return updated;
      }
      const created = base(`b${store.length + 1}`, String(input.patch?.title ?? "New"));
      store.push(created);
      return created;
    });
    const facade: HermesKnowledgeFacadeAPI = {
      listEntities: vi.fn(async () => [...store]),
      getEntity: vi.fn(async ({ entityId }) =>
        store.find((item) => item.id === entityId) ?? null,
      ),
      mutateEntity,
    };
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeBasesPage, {
          onNavigate,
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

    cleanup();
    await act(async () => {
      render(
        React.createElement(KnowledgeBasesPage, {
          params: { knowledgeBaseId: "b2" },
          onBack: () => undefined,
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
      expect(screen.getByTestId("knowledge-base-detail")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-base-title-input"), {
        target: { value: "Beta Updated" },
      });
      fireEvent.click(screen.getByTestId("knowledge-base-save"));
    });
    expect(mutateEntity).toHaveBeenCalled();
  });

  it("disables mutations and stays empty in provider mode", async () => {
    const mutateEntity = vi.fn(async () => {
      throw new Error("must not mutate");
    });
    const facade: HermesKnowledgeFacadeAPI = {
      listEntities: vi.fn(async () => [base("b1", "Nope")]),
      getEntity: vi.fn(async () => null),
      mutateEntity,
    };

    await act(async () => {
      render(
        React.createElement(KnowledgeBasesPage, {
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          facade,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("knowledge-bases-page").getAttribute("data-state"),
      ).toBe("empty");
    });
    expect(screen.getByTestId("knowledge-base-create")).toBeDisabled();
    expect(screen.getByTestId("knowledge-base-list-empty")).toBeTruthy();
    expect(mutateEntity).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(knowledgeEn.bases.mutateDisabled);
  });
});
