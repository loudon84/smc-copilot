// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import { KNOWLEDGE_ROUTE_PAGES } from "../src/renderer/src/screens/Knowledge/knowledge-route-descriptor";
import {
  createKnowledgeRouteScope,
  type KnowledgeRouteScope,
} from "../src/renderer/src/screens/Knowledge/knowledge-route-scope";
import { KnowledgeView } from "../src/renderer/src/screens/Knowledge/KnowledgeView";
import { KnowledgePages } from "../src/renderer/src/screens/Knowledge/KnowledgePages";
import type { KnowledgeCapabilitySnapshot } from "../src/shared/knowledge/knowledge-job-ipc";

const WORK_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src",
);

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

function mockKnowledgeJobs(
  capability: KnowledgeCapabilitySnapshot | null,
): {
  getCapability: ReturnType<typeof vi.fn>;
  listSnapshots: ReturnType<typeof vi.fn>;
  createDraft: ReturnType<typeof vi.fn>;
} {
  const getCapability = vi.fn(async () => {
    if (!capability) {
      throw new Error("knowledgeJobs unavailable");
    }
    return capability;
  });
  const listSnapshots = vi.fn(async () => []);
  const createDraft = vi.fn(async () => {
    throw new Error("createDraft must not be called in fail-closed UI");
  });

  const hermesAPI = {
    knowledgeJobs: capability
      ? {
          getCapability,
          listSnapshots,
          createDraft,
          getSnapshot: vi.fn(),
          cancel: vi.fn(),
          retry: vi.fn(),
          onSnapshotChanged: () => () => undefined,
        }
      : undefined,
    skillRun: {
      start: vi.fn(),
      getFeatureMode: vi.fn(),
    },
    createSession: vi.fn(),
    sendMessage: vi.fn(),
  };

  (
    window as unknown as { hermesAPI: typeof hermesAPI }
  ).hermesAPI = hermesAPI;

  return { getCapability, listSnapshots, createDraft };
}

function collectProductionTsSources(root: string): string[] {
  const out: string[] = [];
  const skip = new Set(["node_modules", "dist", "out", "__tests__"]);
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
          continue;
        }
        walk(full);
        continue;
      }
      if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

describe("Knowledge fail-closed pages (V05)", () => {
  let scope: KnowledgeRouteScope;

  beforeEach(() => {
    scope = createKnowledgeRouteScope({ routeScopeId: "fail-closed" });
    window.desktopAuth = {
      getState: async () => ({
        authenticated: false,
        endpointConfig: null,
        user: null,
        expiresAt: null,
      }),
      saveEndpointConfig: async (config) => config,
      login: async () => ({
        authenticated: false,
        endpointConfig: null,
        user: null,
        expiresAt: null,
      }),
      logout: async () => ({
        authenticated: false,
        endpointConfig: null,
        user: null,
        expiresAt: null,
      }),
      refresh: async () => ({
        authenticated: false,
        endpointConfig: null,
        user: null,
        expiresAt: null,
      }),
      onStateChanged: () => () => undefined,
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { hermesAPI?: unknown }).hermesAPI;
  });

  it("covers all six Stage pages through KnowledgePages", () => {
    expect([...KNOWLEDGE_ROUTE_PAGES]).toEqual([
      "home",
      "bases",
      "sets",
      "documents",
      "uploads",
      "chat",
    ]);
    for (const page of KNOWLEDGE_ROUTE_PAGES) {
      expect(typeof KnowledgePages).toBe("function");
      const { unmount } = render(
        React.createElement(KnowledgePages, { page }),
      );
      expect(screen.getByTestId(`knowledge-page-${page}`)).toBeTruthy();
      unmount();
    }
  });

  it("renders unavailable/empty copy without a Knowledge provider", async () => {
    mockKnowledgeJobs(null);

    await act(async () => {
      render(
        React.createElement(KnowledgeView, { active: true, scope }),
      );
    });

    for (const page of KNOWLEDGE_ROUTE_PAGES) {
      await act(async () => {
        scope.replace({ page, params: {} });
      });
      await waitFor(() => {
        const panel = screen.getByTestId(`knowledge-page-${page}`);
        expect(panel.getAttribute("data-state")).toBe("unavailable");
        expect(panel.textContent).toContain(knowledgeEn.unavailableTitle);
        expect(panel.textContent).toContain(knowledgeEn.unavailableDescription);
        expect(panel.textContent).not.toMatch(/fixture|mock q&a|sample file/i);
      });
    }
  });

  it("renders empty (not fixture) when capability is available but no entities", async () => {
    const { getCapability, listSnapshots } = mockKnowledgeJobs({
      available: true,
      status: "available",
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "bases",
        }),
      );
    });

    expect(getCapability).toHaveBeenCalled();
    await waitFor(() => {
      const panel = screen.getByTestId("knowledge-page-bases");
      expect(panel.getAttribute("data-state")).toBe("empty");
      expect(panel.textContent).toContain(knowledgeEn.emptyTitle);
    });
    expect(listSnapshots).not.toHaveBeenCalled();
  });

  it("shows uploads unavailable without provider and never submits picker jobs", async () => {
    const { createDraft } = mockKnowledgeJobs({
      available: false,
      status: "blocked_provider_unavailable",
    });

    await act(async () => {
      render(React.createElement(KnowledgePages, { page: "uploads" }));
    });

    await waitFor(() => {
      const panel = screen.getByTestId("knowledge-page-uploads");
      expect(panel.getAttribute("data-state")).toBe("unavailable");
    });
    expect(screen.queryByTestId("knowledge-upload-submit")).toBeNull();
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("Knowledge Chat is not sendable and does not call Chat Run / Skill Run", async () => {
    mockKnowledgeJobs({
      available: false,
      status: "blocked_provider_unavailable",
    });

    await act(async () => {
      render(React.createElement(KnowledgePages, { page: "chat" }));
    });

    await waitFor(() => {
      const panel = screen.getByTestId("knowledge-page-chat");
      expect(panel.getAttribute("data-state")).toBe("unavailable");
    });
    expect(screen.queryByTestId("knowledge-chat-send")).toBeNull();
    expect(window.hermesAPI.skillRun?.start).not.toHaveBeenCalled();
    expect(window.hermesAPI.createSession).not.toHaveBeenCalled();
    expect(window.hermesAPI.sendMessage).not.toHaveBeenCalled();
  });

  it("production Work sources omit MockKnowledgeRepository and MockUploadFile", () => {
    const forbidden = ["MockKnowledgeRepository", "MockUploadFile"];
    const hits: string[] = [];
    for (const file of collectProductionTsSources(WORK_SRC)) {
      const text = fs.readFileSync(file, "utf8");
      for (const token of forbidden) {
        if (text.includes(token)) {
          hits.push(`${path.relative(WORK_SRC, file)}:${token}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
