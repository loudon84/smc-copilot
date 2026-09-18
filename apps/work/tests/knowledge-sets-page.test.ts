// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeSetsPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeSetsPage";
import { KnowledgeSetDetailPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeSetDetailPage";
import type { KnowledgeSetSnapshot } from "../src/shared/knowledge/knowledge-set-ipc";
import { makeBasesApi } from "./helpers/knowledge-bases-api";
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

function setSnapshot(
  id: string,
  name: string,
  overrides: Partial<KnowledgeSetSnapshot> = {},
): KnowledgeSetSnapshot {
  return {
    id,
    name,
    description: null,
    status: "active",
    visibility: "organization",
    usageCount: 0,
    knowledgeBases: [],
    ...overrides,
  };
}

const availableCapability = { available: true, status: "available" as const };
const providerMode = {
  dataMode: "provider" as const,
  allowSyntheticData: false,
  configSource: "default" as const,
};

describe("Knowledge Sets pages (4530)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists and creates sets via typed sets API", async () => {
    const store = [setSnapshot("s1", "Set Alpha")];
    const sets = makeSetsApi(store);
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeSetsPage, {
          onNavigate,
          capability: availableCapability,
          mode: providerMode,
          sets,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-item-s1")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-create"));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-set-create-name"), {
        target: { value: "Set Beta" },
      });
      fireEvent.click(screen.getByTestId("knowledge-set-create-submit"));
    });

    await waitFor(() => {
      expect(sets.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Set Beta" }),
      );
      expect(screen.getByTestId("knowledge-set-item-s2")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-item-s1"));
    });
    expect(onNavigate).toHaveBeenCalledWith({
      page: "sets",
      params: { knowledgeSetId: "s1" },
    });
  });

  it("fails closed without sets API", async () => {
    await act(async () => {
      render(
        React.createElement(KnowledgeSetsPage, {
          capability: availableCapability,
          mode: providerMode,
          sets: null,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("knowledge-sets-page").getAttribute("data-state"),
      ).toBe("empty");
    });
    expect(screen.getByTestId("knowledge-set-create")).toBeDisabled();
  });

  it("binds and unbinds bases on detail", async () => {
    const store = [setSnapshot("s1", "Set Alpha")];
    const sets = makeSetsApi(store);
    const bases = makeBasesApi([
      {
        id: "b1",
        name: "Base One",
        description: null,
        status: "active",
        visibility: "organization",
      },
    ]);

    await act(async () => {
      render(
        React.createElement(KnowledgeSetDetailPage, {
          params: { knowledgeSetId: "s1" },
          capability: availableCapability,
          mode: providerMode,
          sets,
          bases,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-detail").getAttribute("data-state")).toBe(
        "content",
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-tab-bindings"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-bind-base")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-set-bind-base"), {
        target: { value: "b1" },
      });
      fireEvent.change(screen.getByTestId("knowledge-set-bind-weight"), {
        target: { value: "2" },
      });
      fireEvent.click(screen.getByTestId("knowledge-set-bind"));
    });

    await waitFor(() => {
      expect(sets.bindBase).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgeSetId: "s1",
          knowledgeBaseId: "b1",
          weight: 2,
        }),
      );
      expect(screen.getByTestId("knowledge-set-bound-b1")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-unbind-b1"));
    });
    await waitFor(() => {
      expect(sets.unbindBase).toHaveBeenCalledWith({
        knowledgeSetId: "s1",
        knowledgeBaseId: "b1",
      });
    });
  });

  it("creates, updates, publishes, and rolls back retrieval profiles", async () => {
    const store = [setSnapshot("s1", "Set Alpha")];
    const sets = makeSetsApi(store);

    await act(async () => {
      render(
        React.createElement(KnowledgeSetDetailPage, {
          params: { knowledgeSetId: "s1" },
          capability: availableCapability,
          mode: providerMode,
          sets,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-detail").getAttribute("data-state")).toBe(
        "content",
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-tab-retrieval"));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("knowledge-set-profile-create-config"),
      ).toBeTruthy();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-set-profile-create-config"), {
        target: { value: '{"top_k":3}' },
      });
      fireEvent.click(screen.getByTestId("knowledge-set-profile-create"));
    });

    await waitFor(() => {
      expect(sets.createProfile).toHaveBeenCalledWith({
        knowledgeSetId: "s1",
        config: { top_k: 3 },
      });
      expect(screen.getByTestId("knowledge-set-profile-p1")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-profile-edit-p1"));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-set-profile-edit-config"), {
        target: { value: '{"top_k":5}' },
      });
      fireEvent.click(screen.getByTestId("knowledge-set-profile-save"));
    });
    await waitFor(() => {
      expect(sets.updateProfile).toHaveBeenCalledWith({
        profileId: "p1",
        config: { top_k: 5 },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-profile-publish-p1"));
    });
    await waitFor(() => {
      expect(sets.publishProfile).toHaveBeenCalledWith({ profileId: "p1" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-rollback-publish"));
      fireEvent.click(screen.getByTestId("knowledge-set-profile-rollback-p1"));
    });
    await waitFor(() => {
      expect(sets.rollbackProfile).toHaveBeenCalledWith({
        profileId: "p1",
        publish: true,
      });
    });
  });

  it("disables create without capability", async () => {
    const sets = makeSetsApi([]);
    await act(async () => {
      render(
        React.createElement(KnowledgeSetsPage, {
          capability: {
            available: false,
            status: "blocked_provider_unavailable",
          },
          mode: providerMode,
          sets,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("knowledge-sets-page").getAttribute("data-state"),
      ).toBe("unavailable");
    });
  });

  it("navigates Start Q&A to chat only", async () => {
    const store = [setSnapshot("s1", "Set Alpha")];
    const sets = makeSetsApi(store);
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeSetDetailPage, {
          params: { knowledgeSetId: "s1" },
          onNavigate,
          capability: availableCapability,
          mode: providerMode,
          sets,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-start-chat")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-set-start-chat"));
    });
    expect(onNavigate).toHaveBeenCalledWith({ page: "chat" });
  });
});
