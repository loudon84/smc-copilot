// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeHomePage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeHomePage";
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

function entity(
  kind: KnowledgeFacadeEntitySnapshot["kind"],
  id: string,
  title: string,
): KnowledgeFacadeEntitySnapshot {
  return {
    id,
    kind,
    title,
    dataMode: "mock",
    partition: {
      workProfileId: "wp",
      authSubject: "user",
      tenantScope: { kind: "personal" },
    },
  };
}

function createFacade(
  entities: KnowledgeFacadeEntitySnapshot[],
): HermesKnowledgeFacadeAPI {
  return {
    listEntities: vi.fn(async ({ kind }) =>
      entities.filter((item) => item.kind === kind),
    ),
    getEntity: vi.fn(async ({ entityId }) =>
      entities.find((item) => item.id === entityId) ?? null,
    ),
    mutateEntity: vi.fn(async () => {
      throw new Error("unexpected mutate");
    }),
  };
}

describe("Knowledge Home page (V02)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows overview/recent/shortcuts from facade fixtures in mock mode", async () => {
    const facade = createFacade([
      entity("base", "b1", "Base One"),
      entity("set", "s1", "Set One"),
      entity("document", "d1", "Doc One"),
    ]);
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgeHomePage, {
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
      expect(screen.getByTestId("knowledge-home-page").getAttribute("data-state")).toBe(
        "content",
      );
    });
    expect(screen.getByTestId("knowledge-home-metrics").textContent).toContain("1");
    expect(screen.getByTestId("knowledge-home-recent").textContent).toContain("Set One");
    expect(screen.getByTestId("knowledge-home-shortcuts")).toBeTruthy();

    expect(screen.queryByTestId("knowledge-home-shortcut-uploads")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-home-shortcut-bases"));
    });
    expect(onNavigate).toHaveBeenCalledWith({ page: "bases", params: {} });
  });

  it("shows structure without fake metrics in provider mode", async () => {
    await act(async () => {
      render(
        React.createElement(KnowledgeHomePage, {
          capability: { available: true, status: "available" },
          mode: {
            dataMode: "provider",
            allowSyntheticData: false,
            configSource: "default",
          },
          facade: createFacade([
            entity("base", "b1", "Should Not Count"),
          ]),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-home-page").getAttribute("data-state")).toBe(
        "empty",
      );
    });
    expect(screen.getByTestId("knowledge-home-provider-no-metrics").textContent).toContain(
      knowledgeEn.home.providerNoMetrics,
    );
    expect(screen.queryByTestId("knowledge-home-metrics")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Should Not Count/);
  });
});
