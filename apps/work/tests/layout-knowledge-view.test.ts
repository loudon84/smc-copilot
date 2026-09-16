// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enNavigation from "../src/shared/i18n/locales/en/navigation";
import type { KnowledgeRouteScope } from "../src/renderer/src/screens/Knowledge/knowledge-route-scope";

const scopeBag = vi.hoisted(() => ({
  scopes: [] as KnowledgeRouteScope[],
}));

vi.mock("../src/renderer/src/screens/Knowledge/knowledge-route-scope", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/renderer/src/screens/Knowledge/knowledge-route-scope")
    >();
  return {
    ...actual,
    createKnowledgeRouteScope: (
      options?: Parameters<typeof actual.createKnowledgeRouteScope>[0],
    ) => {
      const scope = actual.createKnowledgeRouteScope(options);
      scopeBag.scopes.push(scope);
      return scope;
    },
  };
});

vi.mock("../src/renderer/src/components/useI18n", () => ({
  useI18n: () => ({
    locale: "en",
    setLocale: () => undefined,
    t: (key: string): string => {
      if (!key.startsWith("navigation.")) return key;
      const path = key.slice("navigation.".length).split(".");
      let cur: unknown = enNavigation;
      for (const part of path) {
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

vi.mock("../src/renderer/src/components/settings/SettingsModalContext", () => ({
  useSettingsModal: () => ({
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
  }),
}));

vi.mock("../src/renderer/src/update/AppUpdateProvider", () => ({
  useAppUpdate: () => ({
    state: null,
    checkForUpdates: async () => null,
    downloadUpdate: async () => null,
    installUpdate: async () => null,
  }),
}));

vi.mock("../src/renderer/src/screens/Chat/Chat", () => ({
  default: function MockChat(): React.ReactElement {
    const [draft, setDraft] = React.useState("preserved-chat-draft");
    return React.createElement(
      "div",
      { "data-testid": "chat-pane" },
      React.createElement("input", {
        "data-testid": "chat-draft",
        value: draft,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          setDraft(event.target.value);
        },
      }),
    );
  },
}));

function stubScreen(testId: string): {
  default: () => React.ReactElement;
} {
  return {
    default: function Stub(): React.ReactElement {
      return React.createElement("div", { "data-testid": testId });
    },
  };
}

vi.mock("../src/renderer/src/screens/Sessions/Sessions", () =>
  stubScreen("sessions-screen"),
);
vi.mock("../src/renderer/src/screens/Agents/Agents", () =>
  stubScreen("agents-screen"),
);
vi.mock("../src/renderer/src/screens/Discover/Discover", () =>
  stubScreen("discover-screen"),
);
vi.mock("../src/renderer/src/screens/Skills/Skills", () =>
  stubScreen("skills-screen"),
);
vi.mock("../src/renderer/src/screens/Memory/Memory", () =>
  stubScreen("memory-screen"),
);
vi.mock("../src/renderer/src/screens/Tools/Tools", () =>
  stubScreen("tools-screen"),
);
vi.mock("../src/renderer/src/screens/Gateway/Gateway", () =>
  stubScreen("gateway-screen"),
);
vi.mock("../src/renderer/src/screens/Office/Office", () =>
  stubScreen("office-screen"),
);
vi.mock("../src/renderer/src/screens/Providers/Providers", () =>
  stubScreen("providers-screen"),
);
vi.mock("../src/renderer/src/screens/Schedules/Schedules", () =>
  stubScreen("schedules-screen"),
);
vi.mock("../src/renderer/src/screens/Kanban/Kanban", () =>
  stubScreen("kanban-screen"),
);

vi.mock("../src/renderer/src/screens/Layout/SidebarRecentSessions", () => ({
  default: function SidebarRecentSessionsStub(): React.ReactElement {
    return React.createElement("div", {
      "data-testid": "sidebar-recent-sessions",
    });
  },
}));

vi.mock("../src/renderer/src/screens/Layout/ProfileSwitcher", () => ({
  default: function ProfileSwitcherStub(): React.ReactElement {
    return React.createElement("div", { "data-testid": "profile-switcher" });
  },
}));

vi.mock("../src/renderer/src/screens/Layout/ActiveSessionsBar", () => ({
  ActiveSessionsBar: function ActiveSessionsBarStub(): React.ReactElement {
    return React.createElement("div", { "data-testid": "active-sessions-bar" });
  },
}));

vi.mock("../src/renderer/src/screens/Layout/StatusBar", () => ({
  StatusBar: function StatusBarStub(): React.ReactElement {
    return React.createElement("div", { "data-testid": "status-bar" });
  },
}));

vi.mock("../src/renderer/src/components/RemoteNotice", () => ({
  default: function RemoteNoticeStub(): React.ReactElement {
    return React.createElement("div", { "data-testid": "remote-notice" });
  },
}));

function installHermesApi(): void {
  window.hermesAPI = {
    listProfiles: async () => [
      {
        id: "default",
        name: "Default",
        isActive: true,
        model: "test-model",
        skillCount: 0,
        gatewayRunning: false,
      },
    ],
    isRemoteOnlyMode: async () => false,
    onMenuNewChat: () => () => undefined,
    onMenuSearchSessions: () => () => undefined,
    abortChat: () => undefined,
    getConnectionConfig: async () => ({ mode: "local" }),
    runtimeEnsureLocalReady: async () => undefined,
    getSessionMessages: async () => [],
  } as unknown as typeof window.hermesAPI;
}

function installResizeObserver(): void {
  if (typeof window.ResizeObserver !== "undefined") return;
  window.ResizeObserver = class ResizeObserverStub {
    observe(): void {
      /* no-op for jsdom */
    }
    unobserve(): void {
      /* no-op for jsdom */
    }
    disconnect(): void {
      /* no-op for jsdom */
    }
  } as unknown as typeof ResizeObserver;
}

describe("Layout Knowledge View keep-alive (V01)", () => {
  beforeEach(() => {
    installHermesApi();
    installResizeObserver();
    scopeBag.scopes = [];
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keep-alives Knowledge route snapshot, preserves Chat, isolates history, and resolves the English sidebar label", async () => {
    const Layout = (await import("../src/renderer/src/screens/Layout/Layout"))
      .default;

    const historyPush = vi.spyOn(window.history, "pushState");
    const historyReplace = vi.spyOn(window.history, "replaceState");
    const historyLengthBefore = window.history.length;

    render(React.createElement(Layout));

    const knowledgeNav = screen.getByRole("button", { name: "Knowledge" });
    expect(knowledgeNav.textContent).toContain("Knowledge");
    expect(knowledgeNav.textContent).not.toContain("navigation.knowledge");

    await act(async () => {
      fireEvent.click(knowledgeNav);
    });

    const knowledgeView = await screen.findByTestId("knowledge-view");
    expect(knowledgeView.getAttribute("data-active")).toBe("true");
    expect(scopeBag.scopes.length).toBeGreaterThanOrEqual(1);

    const scope = scopeBag.scopes[0];
    await act(async () => {
      scope.push({ page: "bases", params: { knowledgeBaseId: "kb-1" } });
    });
    expect(screen.getByTestId("knowledge-route-page").textContent).toBe(
      "bases",
    );
    expect(historyPush).not.toHaveBeenCalled();
    expect(historyReplace).not.toHaveBeenCalled();
    expect(window.history.length).toBe(historyLengthBefore);

    const chatDraft = screen.getByTestId("chat-draft") as HTMLInputElement;
    expect(chatDraft.value).toBe("preserved-chat-draft");
    await act(async () => {
      fireEvent.change(chatDraft, {
        target: { value: "user-edited-draft" },
      });
    });
    expect(chatDraft.value).toBe("user-edited-draft");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New Chat" }));
    });

    expect(knowledgeView.isConnected).toBe(true);
    expect(knowledgeView.getAttribute("data-active")).toBe("false");
    const knowledgePane = knowledgeView.parentElement as HTMLElement;
    expect(knowledgePane.style.display).toBe("none");
    expect(
      (screen.getByTestId("chat-draft") as HTMLInputElement).value,
    ).toBe("user-edited-draft");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Knowledge" }));
    });

    expect(screen.getByTestId("knowledge-view").getAttribute("data-active")).toBe(
      "true",
    );
    expect(screen.getByTestId("knowledge-route-page").textContent).toBe(
      "bases",
    );
    expect(
      (screen.getByTestId("chat-draft") as HTMLInputElement).value,
    ).toBe("user-edited-draft");
    expect(historyPush).not.toHaveBeenCalled();
    expect(window.history.length).toBe(historyLengthBefore);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("navigation:goto", { detail: "kanban" }),
      );
    });

    expect(screen.getByTestId("kanban-screen")).toBeTruthy();
    expect(screen.getByTestId("knowledge-view").getAttribute("data-active")).toBe(
      "false",
    );
    expect(
      (screen.getByTestId("knowledge-view").parentElement as HTMLElement).style
        .display,
    ).toBe("none");
  }, 20_000);
});
