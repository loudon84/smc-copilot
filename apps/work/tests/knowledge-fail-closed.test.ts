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
import type {
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
} from "../src/shared/knowledge/knowledge-job-ipc";

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

type MockKnowledgeJobsOptions = {
  capability: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot | null;
};

function mockKnowledgeJobs(
  capabilityOrOptions: KnowledgeCapabilitySnapshot | null | MockKnowledgeJobsOptions,
): {
  getCapability: ReturnType<typeof vi.fn>;
  listSnapshots: ReturnType<typeof vi.fn>;
  createDraft: ReturnType<typeof vi.fn>;
  getMode: ReturnType<typeof vi.fn>;
} {
  const options: MockKnowledgeJobsOptions =
    capabilityOrOptions !== null &&
    typeof capabilityOrOptions === "object" &&
    "capability" in capabilityOrOptions
      ? capabilityOrOptions
      : { capability: capabilityOrOptions };

  const capability = options.capability;
  const mode = options.mode;

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
  const getMode = vi.fn(async () => {
    if (mode === null) {
      throw new Error("KNOWLEDGE_MODE_ERROR");
    }
    if (mode) return mode;
    return {
      dataMode: "provider" as const,
      allowSyntheticData: false,
      configSource: "default",
    };
  });
  const listEntities = vi.fn(async () => []);
  const getEntity = vi.fn(async () => null);
  const mutateEntity = vi.fn(async () => {
    throw new Error("KNOWLEDGE_FACADE_UNAVAILABLE");
  });

  const exposeApi =
    capabilityOrOptions !== null &&
    typeof capabilityOrOptions === "object" &&
    "capability" in capabilityOrOptions
      ? true
      : Boolean(capability);

  const hermesAPI = {
    knowledgeJobs: exposeApi
      ? {
          getCapability,
          listSnapshots,
          createDraft,
          getSnapshot: vi.fn(),
          cancel: vi.fn(),
          retry: vi.fn(),
          onSnapshotChanged: () => () => undefined,
          getMode,
          facade: {
            listEntities,
            getEntity,
            mutateEntity,
          },
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

  return { getCapability, listSnapshots, createDraft, getMode };
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
        if (page === "uploads") {
          expect(panel.textContent).toContain(knowledgeEn.uploads.pickerBlocked);
        } else if (page === "chat") {
          expect(panel.textContent).toContain(knowledgeEn.chat.composerBlocked);
        } else {
          expect(panel.textContent).toContain(knowledgeEn.unavailableDescription);
        }
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
      expect(panel.textContent).toContain(knowledgeEn.bases.emptyList);
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

  it("shows a persistent Mock/Demo badge only in mock mode (AC-08)", async () => {
    mockKnowledgeJobs({
      capability: {
        available: false,
        status: "blocked_provider_unavailable",
      },
      mode: {
        dataMode: "mock",
        allowSyntheticData: true,
        channel: "local",
        configSource: "env",
      },
    });

    await act(async () => {
      render(React.createElement(KnowledgeView, { active: true, scope }));
    });

    await waitFor(() => {
      const badge = screen.getByTestId("knowledge-mock-demo-badge");
      expect(badge.textContent).toContain(knowledgeEn.mockDemoBadge);
      expect(badge.getAttribute("data-persistent")).toBe("true");
    });
    expect(screen.queryByTestId("knowledge-mock-demo-badge-dismiss")).toBeNull();

    // Renderer must not be able to hide the badge while Main reports mock.
    await act(async () => {
      scope.replace({ page: "bases", params: {} });
    });
    expect(screen.getByTestId("knowledge-mock-demo-badge")).toBeTruthy();
  });

  it("hides Mock/Demo badge in provider mode and never renders fixture lists (AC-08/10)", async () => {
    mockKnowledgeJobs({
      capability: {
        available: true,
        status: "available",
      },
      mode: {
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      },
    });

    await act(async () => {
      render(React.createElement(KnowledgeView, { active: true, scope }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-page-home")).toBeTruthy();
    });
    expect(screen.queryByTestId("knowledge-mock-demo-badge")).toBeNull();
    expect(screen.queryByTestId("knowledge-fixture-list")).toBeNull();
    expect(screen.queryByTestId("knowledge-home-metrics")).toBeNull();
    expect(screen.getByTestId("knowledge-home-provider-no-metrics")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /fixture|mock q&a|sample file|synthetic base/i,
    );
  });

  it("hosts six Work-native pages without Profile/Preferences and without apps/knowledge imports (AC-01/02)", async () => {
    mockKnowledgeJobs({
      capability: {
        available: false,
        status: "blocked_provider_unavailable",
      },
      mode: {
        dataMode: "mock",
        allowSyntheticData: true,
        configSource: "env",
      },
    });

    await act(async () => {
      render(React.createElement(KnowledgeView, { active: true, scope }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-module-nav")).toBeTruthy();
    });
    for (const page of KNOWLEDGE_ROUTE_PAGES) {
      expect(screen.getByTestId(`knowledge-nav-${page}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("knowledge-nav-profile")).toBeNull();
    expect(screen.queryByTestId("knowledge-nav-preferences")).toBeNull();
    expect([...KNOWLEDGE_ROUTE_PAGES]).not.toContain("profile");
    expect([...KNOWLEDGE_ROUTE_PAGES]).not.toContain("preferences");

    const hits: string[] = [];
    for (const file of collectProductionTsSources(WORK_SRC)) {
      const text = fs.readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
          continue;
        }
        if (
          /(?:from|import)\s+["'][^"']*apps\/knowledge/.test(trimmed) ||
          /require\(\s*["'][^"']*apps\/knowledge/.test(trimmed)
        ) {
          hits.push(path.relative(WORK_SRC, file));
          break;
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("keeps Mock/Demo badge visible across page switches when dataMode=mock (AC-12)", async () => {
    mockKnowledgeJobs({
      capability: {
        available: false,
        status: "blocked_provider_unavailable",
      },
      mode: {
        dataMode: "mock",
        allowSyntheticData: true,
        configSource: "env",
      },
    });

    await act(async () => {
      render(React.createElement(KnowledgeView, { active: true, scope }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-mock-demo-badge")).toBeTruthy();
    });

    for (const page of KNOWLEDGE_ROUTE_PAGES) {
      await act(async () => {
        scope.replace({ page, params: {} });
      });
      expect(screen.getByTestId("knowledge-mock-demo-badge")).toBeTruthy();
      expect(screen.getByTestId(`knowledge-page-${page}`)).toBeTruthy();
    }
  });

  it("latches Knowledge mode IPC before Job recoverOnStart (AC-05)", () => {
    const registerSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/main/ipc/register.ts",
      ),
      "utf8",
    );
    const modeCall = registerSrc.indexOf(
      "registerKnowledgeModeIpcHandlers(ipcMain)",
    );
    const jobCall = registerSrc.indexOf(
      "registerKnowledgeJobIpcHandlers(ipcMain)",
    );
    expect(modeCall).toBeGreaterThan(-1);
    expect(jobCall).toBeGreaterThan(-1);
    expect(modeCall).toBeLessThan(jobCall);
  });
});
