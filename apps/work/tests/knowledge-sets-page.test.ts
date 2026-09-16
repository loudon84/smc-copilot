// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeSetsPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage";
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

function setEntity(id: string, title: string): KnowledgeFacadeEntitySnapshot {
  return {
    id,
    kind: "set",
    title,
    dataMode: "mock",
    partition: {
      workProfileId: "wp",
      authSubject: "user",
      tenantScope: { kind: "personal" },
    },
  };
}

describe("Knowledge Sets page (V03)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("supports list/detail and mock binding submit", async () => {
    const store = [setEntity("s1", "Set Alpha")];
    const mutateEntity = vi.fn(async (input: KnowledgeFacadeMutateInput) => {
      const existing = store.find((item) => item.id === input.entityId)!;
      return { ...existing, title: String(input.patch?.title ?? existing.title) };
    });
    const facade: HermesKnowledgeFacadeAPI = {
      listEntities: vi.fn(async () => [...store]),
      getEntity: vi.fn(async ({ entityId }) =>
        store.find((item) => item.id === entityId) ?? null,
      ),
      mutateEntity,
    };

    await act(async () => {
      render(
        React.createElement(KnowledgeSetsPage, {
          params: { knowledgeSetId: "s1" },
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
      expect(screen.getByTestId("knowledge-set-detail")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-set-bindings")).toBeTruthy();
    expect(screen.getByTestId("knowledge-set-retrieval")).toBeTruthy();

    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-set-weight"), {
        target: { value: "2" },
      });
      fireEvent.click(screen.getByTestId("knowledge-set-submit"));
    });
    expect(mutateEntity).toHaveBeenCalled();
  });

  it("blocks provider submit", async () => {
    const mutateEntity = vi.fn(async () => {
      throw new Error("blocked");
    });
    const facade: HermesKnowledgeFacadeAPI = {
      listEntities: vi.fn(async () => []),
      getEntity: vi.fn(async () => setEntity("s1", "Hidden")),
      mutateEntity,
    };

    await act(async () => {
      render(
        React.createElement(KnowledgeSetsPage, {
          params: { knowledgeSetId: "s1" },
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
        screen.getByTestId("knowledge-sets-page").getAttribute("data-state"),
      ).toBe("not-found");
    });
    expect(screen.queryByTestId("knowledge-set-submit")).toBeNull();
    expect(mutateEntity).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/http:\/\//i);
  });

  it("disables list create in provider mode", async () => {
    await act(async () => {
      render(
        React.createElement(KnowledgeSetsPage, {
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          facade: {
            listEntities: vi.fn(async () => []),
            getEntity: vi.fn(async () => null),
            mutateEntity: vi.fn(async () => {
              throw new Error("no");
            }),
          },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-create")).toBeDisabled();
    });
    expect(document.body.textContent).toContain(knowledgeEn.sets.mutateDisabled);
  });

  it("opens the create dialog from the set list", async () => {
    await act(async () => {
      render(
        React.createElement(KnowledgeSetsPage, {
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "mock",
            allowSyntheticData: true,
            configSource: "env",
          },
          facade: {
            listEntities: vi.fn(async () => [setEntity("s1", "Set Alpha")]),
            getEntity: vi.fn(async () => null),
            mutateEntity: vi.fn(async () => setEntity("s1", "Set Alpha")),
          },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-list")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-create"));
    });
    expect(screen.getByTestId("knowledge-set-create-title")).toBeTruthy();
  });
});
