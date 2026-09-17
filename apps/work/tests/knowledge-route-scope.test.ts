// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopAuthState } from "../src/shared/auth/auth-contract";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import {
  KNOWLEDGE_ROUTE_PAGES,
  type KnowledgePageId,
} from "../src/renderer/src/screens/Knowledge/knowledge-route-descriptor";
import {
  createKnowledgeRouteScope,
  type KnowledgeRouteScope,
} from "../src/renderer/src/screens/Knowledge/knowledge-route-scope";
import {
  KnowledgeView,
  type KnowledgeUiEffectCounters,
} from "../src/renderer/src/screens/Knowledge/KnowledgeView";
import * as routeScopeModule from "../src/renderer/src/screens/Knowledge/knowledge-route-scope";

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

const PUBLIC_AUTH: DesktopAuthState = {
  authenticated: true,
  endpointConfig: {
    backendUrl: "https://example.test",
    authPrefix: "/auth",
    aiosHomeUrl: "https://home.example.test",
  },
  user: {
    id: "user-1",
    username: "alice",
    displayName: "Alice",
    tenantId: "tenant-1",
  },
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function mockDesktopAuth(state: DesktopAuthState = PUBLIC_AUTH): void {
  const listeners = new Set<(next: DesktopAuthState) => void>();
  window.desktopAuth = {
    getState: async () => state,
    saveEndpointConfig: async (config) => config,
    login: async () => state,
    logout: async () => ({
      authenticated: false,
      endpointConfig: state.endpointConfig,
      user: null,
      expiresAt: null,
    }),
    refresh: async () => state,
    onStateChanged: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

describe("Knowledge route scope and descriptor (V02)", () => {
  beforeEach(() => {
    mockDesktopAuth();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("covers exactly the five Stage pages", () => {
    expect([...KNOWLEDGE_ROUTE_PAGES]).toEqual([
      "home",
      "bases",
      "sets",
      "documents",
      "chat",
    ]);
    const pages: KnowledgePageId[] = [...KNOWLEDGE_ROUTE_PAGES];
    expect(new Set(pages).size).toBe(5);
  });

  it("resolves a leftover uploads route to bases", () => {
    const scope = createKnowledgeRouteScope();
    scope.replace({ page: "uploads", params: { knowledgeBaseId: "kb-old" } });
    expect(scope.getSnapshot().current).toEqual({ page: "bases", params: {} });
  });

  it("isolates mutable state across two host-constructed scopes", () => {
    const a: KnowledgeRouteScope = createKnowledgeRouteScope({
      routeScopeId: "scope-a",
    });
    const b: KnowledgeRouteScope = createKnowledgeRouteScope({
      routeScopeId: "scope-b",
    });

    a.push({ page: "bases", params: { knowledgeBaseId: "kb-1" } });
    expect(a.getSnapshot().current.page).toBe("bases");
    expect(b.getSnapshot().current.page).toBe("home");

    b.replace({ page: "uploads", params: {} });
    expect(a.getSnapshot().current.page).toBe("bases");
    expect(b.getSnapshot().current.page).toBe("bases");

    a.push({ page: "documents", params: { documentId: "doc-1" } });
    a.back();
    expect(a.getSnapshot().current.page).toBe("bases");
    expect(b.getSnapshot().current.page).toBe("bases");

    a.reset();
    expect(a.getSnapshot().current.page).toBe("home");
    expect(b.getSnapshot().current.page).toBe("bases");
  });

  it("falls back to home for invalid routes and does not export a tab collection API", () => {
    const scope = createKnowledgeRouteScope();
    scope.push({ page: "not-a-page" as KnowledgePageId, params: {} });
    expect(scope.getSnapshot().current.page).toBe("home");

    const exported = Object.keys(routeScopeModule);
    expect(exported.some((key) => /tab/i.test(key))).toBe(false);
    expect(routeScopeModule).not.toHaveProperty("createKnowledgeTabCollection");
    expect(routeScopeModule).not.toHaveProperty("tabCollection");
  });

  it("keeps UI-only polling/rAF/shortcut counters at 0 while active=false for 30s", () => {
    const counters: KnowledgeUiEffectCounters = {
      pollingTicks: 0,
      rafTicks: 0,
      shortcutCalls: 0,
    };

    render(
      React.createElement(KnowledgeView, {
        active: false,
        uiEffectCounters: counters,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
      );
    });

    expect(counters.pollingTicks).toBe(0);
    expect(counters.rafTicks).toBe(0);
    expect(counters.shortcutCalls).toBe(0);
  });

  it("reads only public desktopAuth state (no token fields on the view)", async () => {
    const scope = createKnowledgeRouteScope();
    const { container } = render(
      React.createElement(KnowledgeView, {
        active: true,
        scope,
        uiEffectCounters: {
          pollingTicks: 0,
          rafTicks: 0,
          shortcutCalls: 0,
        },
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    const root = container.querySelector("[data-testid='knowledge-view']");
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-auth-subject")).toBe("user-1");
    expect(container.innerHTML).not.toMatch(/accessToken|refreshToken|Bearer/i);
  });
});
