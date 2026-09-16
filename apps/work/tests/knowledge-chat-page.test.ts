// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeChatPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage";
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

function session(id: string, title: string): KnowledgeFacadeEntitySnapshot {
  return {
    id,
    kind: "session",
    title,
    dataMode: "mock",
    partition: {
      workProfileId: "wp",
      authSubject: "user",
      tenantScope: { kind: "personal" },
    },
  };
}

describe("Knowledge Chat page (V06)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { hermesAPI?: unknown }).hermesAPI;
  });

  it("renders session/composer/citation and sends via facade only in mock mode", async () => {
    const store: KnowledgeFacadeEntitySnapshot[] = [session("s1", "Demo")];
    const mutateEntity = vi.fn(async (input: KnowledgeFacadeMutateInput) => {
      if (input.kind === "citation") {
        return {
          id: "c1",
          kind: "citation" as const,
          title: "Cite",
          dataMode: "mock" as const,
          partition: store[0]!.partition,
        };
      }
      if (!input.entityId) {
        const created = session(`s${store.length + 1}`, "Created");
        store.push(created);
        return created;
      }
      return store.find((item) => item.id === input.entityId) ?? store[0]!;
    });
    const facade: HermesKnowledgeFacadeAPI = {
      listEntities: vi.fn(async ({ kind }) =>
        store.filter((item) => item.kind === kind),
      ),
      getEntity: vi.fn(async ({ entityId }) =>
        store.find((item) => item.id === entityId) ?? null,
      ),
      mutateEntity,
    };
    const onReplace = vi.fn();

    (
      window as unknown as {
        hermesAPI: {
          createSession: ReturnType<typeof vi.fn>;
          sendMessage: ReturnType<typeof vi.fn>;
          skillRun: { start: ReturnType<typeof vi.fn> };
        };
      }
    ).hermesAPI = {
      createSession: vi.fn(),
      sendMessage: vi.fn(),
      skillRun: { start: vi.fn() },
    };

    await act(async () => {
      render(
        React.createElement(KnowledgeChatPage, {
          params: { sessionId: "s1" },
          onReplace,
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
      expect(screen.getByTestId("knowledge-chat-sessions")).toBeTruthy();
    });
    expect(screen.getByTestId("knowledge-chat-composer")).toBeTruthy();
    expect(screen.getByTestId("knowledge-chat-citations")).toBeTruthy();
    expect(screen.getByTestId("knowledge-chat-new-session")).toBeTruthy();

    await act(async () => {
      fireEvent.change(screen.getByTestId("knowledge-chat-composer"), {
        target: { value: "What is in the handbook?" },
      });
      fireEvent.click(screen.getByTestId("knowledge-chat-send"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-chat-thread")).toBeTruthy();
    });
    expect(mutateEntity).toHaveBeenCalled();
    expect(window.hermesAPI.createSession).not.toHaveBeenCalled();
    expect(window.hermesAPI.sendMessage).not.toHaveBeenCalled();
    expect(window.hermesAPI.skillRun?.start).not.toHaveBeenCalled();
  });

  it("disables composer in provider mode and never imports Work Chat run APIs", async () => {
    const pageSrc = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx",
      ),
      "utf8",
    );
    expect(pageSrc).not.toMatch(/screens\/Chat|createSession|skillRun|sendMessage/);

    await act(async () => {
      render(
        React.createElement(KnowledgeChatPage, {
          capability: {
            available: false,
            status: "blocked_provider_unavailable",
          },
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
      expect(
        screen.getByTestId("knowledge-chat-page").getAttribute("data-state"),
      ).toBe("unavailable");
    });
    expect(screen.queryByTestId("knowledge-chat-send")).toBeNull();
  });
});
