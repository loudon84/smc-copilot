// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KnowledgeChatPage } from "../src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage";
import { asChatWindowApi } from "./knowledge-chat-window";

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

describe("Knowledge Chat page (V06)", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = () => undefined;
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    (
      window as unknown as { hermesAPI: Record<string, unknown> }
    ).hermesAPI = asChatWindowApi({
      createSession: vi.fn(),
      sendMessage: vi.fn(),
      skillRun: {
        start: vi.fn(),
        getFeatureMode: vi.fn(async () => ({ mode: "off" })),
        onProjectionChanged: vi.fn(() => () => undefined),
      },
      getConnectionConfig: vi.fn(async () => ({ mode: "local", remoteUrl: "" })),
      onConnectionConfigChanged: vi.fn(() => () => undefined),
      getSessionMessages: vi.fn(async () => []),
      getSessionContextFolder: vi.fn(async () => null),
      setSessionContextFolder: vi.fn(async () => true),
      onContextMenuCopyChat: vi.fn(() => () => undefined),
      onContextMenuSelectBubble: vi.fn(() => () => undefined),
    });
    (
      window as unknown as {
        desktopAuth: {
          getState: ReturnType<typeof vi.fn>;
          onStateChanged: ReturnType<typeof vi.fn>;
        };
      }
    ).desktopAuth = {
      getState: vi.fn(async () => ({ user: null })),
      onStateChanged: vi.fn(() => () => undefined),
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { hermesAPI?: unknown }).hermesAPI;
  });

  it("blocks resume when the session has no knowledge binding and does not start Chat Run", async () => {
    const createSession = vi.fn();
    const sendMessage = vi.fn();
    const start = vi.fn();
    (
      window as unknown as { hermesAPI: Record<string, unknown> }
    ).hermesAPI = asChatWindowApi({
      createSession,
      sendMessage,
      skillRun: { start },
    });

    await act(async () => {
      render(
        React.createElement(KnowledgeChatPage, {
          params: { sessionId: "s1" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(knowledgeEn.chat.bindingMissing)).toBeTruthy();
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("hosts shared Chat without calling Work Chat run APIs", async () => {
    const pageSrc = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../src/renderer/src/screens/Knowledge/pages/KnowledgeChatPage.tsx",
      ),
      "utf8",
    );
    expect(pageSrc).toContain("../../Chat/Chat");
    expect(pageSrc).not.toMatch(/createSession\(|sendMessage\(|skillRun\.start/);

    await act(async () => {
      render(React.createElement(KnowledgeChatPage));
    });

    await waitFor(() => {
      expect(
        screen.getByText("Select a Knowledge Set before sending."),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId("knowledge-chat-send")).toBeNull();
  });
});
