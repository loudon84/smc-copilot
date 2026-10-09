// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import knowledgeEn from "../src/shared/i18n/locales/en/knowledge";
import {
  KNOWLEDGE_ROUTE_PAGES,
  type KnowledgePageId,
} from "../src/renderer/src/screens/Knowledge/knowledge-route-descriptor";
import { KnowledgePages } from "../src/renderer/src/screens/Knowledge/KnowledgePages";
import { KnowledgeView } from "../src/renderer/src/screens/Knowledge/KnowledgeView";
import { createKnowledgeRouteScope } from "../src/renderer/src/screens/Knowledge/knowledge-route-scope";
import type { DesktopAuthState } from "../src/shared/auth/auth-contract";
import { asChatWindowApi } from "./knowledge-chat-window";
import type {
  HermesKnowledgeFacadeAPI,
  KnowledgeCapabilitySnapshot,
  KnowledgeModeSnapshot,
  KnowledgeJobSnapshot,
} from "../src/shared/knowledge/knowledge-job-ipc";
import type { HermesKnowledgeBasesAPI } from "../src/shared/knowledge/knowledge-base-ipc";
import type { HermesKnowledgeSetsAPI } from "../src/shared/knowledge/knowledge-set-ipc";
import {
  makeBasesApi,
  unusedKnowledgeBaseOps,
} from "./helpers/knowledge-bases-api";
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

function mockJobs(options: {
  capability?: KnowledgeCapabilitySnapshot | null;
  mode?: KnowledgeModeSnapshot;
  facade?: HermesKnowledgeFacadeAPI;
  bases?: HermesKnowledgeBasesAPI;
  sets?: HermesKnowledgeSetsAPI;
}): void {
  const capability =
    options.capability === undefined
      ? ({ available: false, status: "blocked_provider_unavailable" } as const)
      : options.capability;
  const mode =
    options.mode ??
    ({
      dataMode: "provider",
      allowSyntheticData: false,
      configSource: "default",
    } as const);

  const facade =
    options.facade ??
    ({
      listEntities: vi.fn(async () => []),
      getEntity: vi.fn(async () => null),
      mutateEntity: vi.fn(async () => {
        throw new Error("KNOWLEDGE_FACADE_UNAVAILABLE");
      }),
    } satisfies HermesKnowledgeFacadeAPI);

  const bases =
    options.bases ??
    ({
      list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
      get: vi.fn(async () => {
        throw new Error("KNOWLEDGE_NOT_FOUND");
      }),
      create: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      update: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      delete: vi.fn(async () => undefined),
      listFiles: vi.fn(async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 50,
      })),
      ...unusedKnowledgeBaseOps(),
    } satisfies HermesKnowledgeBasesAPI);

  const sets =
    options.sets ??
    ({
      list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 50 })),
      get: vi.fn(async () => {
        throw new Error("KNOWLEDGE_NOT_FOUND");
      }),
      create: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      update: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      bindBase: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      unbindBase: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      listProfiles: vi.fn(async () => []),
      createProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      getProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_NOT_FOUND");
      }),
      updateProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      publishProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
      rollbackProfile: vi.fn(async () => {
        throw new Error("KNOWLEDGE_UNAVAILABLE");
      }),
    } satisfies HermesKnowledgeSetsAPI);

  (
    window as unknown as {
      hermesAPI: {
        knowledgeJobs: {
          getCapability: ReturnType<typeof vi.fn>;
          getMode: ReturnType<typeof vi.fn>;
          facade: HermesKnowledgeFacadeAPI;
          bases: HermesKnowledgeBasesAPI;
          sets: HermesKnowledgeSetsAPI;
          listSnapshots: ReturnType<typeof vi.fn>;
          createDraft: ReturnType<typeof vi.fn>;
          onSnapshotChanged: () => () => undefined;
        };
        onConnectionConfigChanged: ReturnType<typeof vi.fn>;
      };
      desktopAuth: {
        getState: ReturnType<typeof vi.fn>;
        onStateChanged: ReturnType<typeof vi.fn>;
      };
    }
  ).hermesAPI = asChatWindowApi({
    knowledgeJobs: {
      getCapability: vi.fn(async () => {
        if (!capability) throw new Error("capability missing");
        return capability;
      }),
      getMode: vi.fn(async () => mode),
      facade,
      bases,
      sets,
      listSnapshots: vi.fn(async () => []),
      createDraft: vi.fn(async () => {
        throw new Error("createDraft blocked");
      }),
      onSnapshotChanged: () => () => undefined,
    },
    onConnectionConfigChanged: vi.fn(() => () => undefined),
    getConnectionConfig: vi.fn(async () => ({ mode: "local", remoteUrl: "" })),
    getSessionMessages: vi.fn(async () => []),
    getSessionContextFolder: vi.fn(async () => null),
    setSessionContextFolder: vi.fn(async () => true),
    skillRun: {
      getFeatureMode: vi.fn(async () => ({ mode: "off" })),
      onProjectionChanged: vi.fn(() => () => undefined),
    },
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
}

describe("Knowledge page host (V01)", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = () => undefined;
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    mockJobs({
      capability: { available: true, status: "available" },
      mode: {
        dataMode: "mock",
        allowSyntheticData: true,
        configSource: "env",
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { hermesAPI?: unknown }).hermesAPI;
  });

  it("passes route-scope params into the active page slot", async () => {
    const entities = [
      {
        id: "base-42",
        kind: "base" as const,
        dataMode: "mock" as const,
        partition: {
          workProfileId: "wp",
          authSubject: "user",
          tenantScope: { kind: "personal" as const },
        },
        title: "Base Forty Two",
      },
    ];
    mockJobs({
      capability: { available: true, status: "available" },
      mode: {
        dataMode: "mock",
        allowSyntheticData: true,
        configSource: "env",
      },
      facade: {
        listEntities: vi.fn(async () => entities),
        getEntity: vi.fn(async () => entities[0]),
        mutateEntity: vi.fn(async () => entities[0]),
      },
      bases: {
        list: vi.fn(async () => ({
          items: [
            {
              id: "base-42",
              name: "Base Forty Two",
              description: null,
              status: "active",
              visibility: "private",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        })),
        get: vi.fn(async () => ({
          id: "base-42",
          name: "Base Forty Two",
          description: null,
          status: "active",
          visibility: "private",
        })),
        create: vi.fn(async () => {
          throw new Error("unused");
        }),
        update: vi.fn(async () => {
          throw new Error("unused");
        }),
        delete: vi.fn(async () => undefined),
        listFiles: vi.fn(async () => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 50,
        })),
        ...unusedKnowledgeBaseOps(),
      },
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "bases",
          params: { knowledgeBaseId: "base-42" },
          onNavigate: () => undefined,
          onBack: () => undefined,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-detail-id").textContent).toBe(
        "base-42",
      );
    });
    expect(window.location.href).not.toContain("base-42");
  });

  it("switches across five Knowledge pages without a Profile or Uploads slot", async () => {
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "home",
          params: {},
          onNavigate,
        }),
      );
    });

    const nav = screen.getByTestId("knowledge-module-nav");
    expect(nav).toBeTruthy();
    expect(nav.className).toContain("memory-tabs");
    expect(screen.getByTestId("knowledge-nav-home").className).toContain(
      "memory-tab",
    );
    expect(screen.queryByTestId("knowledge-nav-profile")).toBeNull();
    expect(screen.queryByTestId("knowledge-nav-preferences")).toBeNull();
    expect(screen.queryByTestId("knowledge-nav-uploads")).toBeNull();

    for (const page of KNOWLEDGE_ROUTE_PAGES) {
      expect(screen.getByTestId(`knowledge-nav-${page}`)).toBeTruthy();
    }

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-nav-bases"));
    });
    expect(onNavigate).toHaveBeenCalledWith({ page: "bases", params: {} });

    for (const page of KNOWLEDGE_ROUTE_PAGES) {
      cleanup();
      await act(async () => {
        render(
          React.createElement(KnowledgePages, {
            page: page as KnowledgePageId,
            params: {},
            onNavigate,
          }),
        );
      });
      await waitFor(() => {
        const panel = screen.getByTestId(`knowledge-page-${page}`);
        expect(panel.getAttribute("data-knowledge-host")).toBe("true");
        expect(panel.getAttribute("data-page")).toBe(page);
      });
    }
  });

  it("fail-closes at host level when provider capability is unavailable", async () => {
    mockJobs({
      capability: {
        available: false,
        status: "blocked_provider_unavailable",
      },
      mode: {
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      },
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "documents",
          params: {},
        }),
      );
    });

    await waitFor(() => {
      const panel = screen.getByTestId("knowledge-page-documents");
      expect(panel.getAttribute("data-state")).toBe("unavailable");
      expect(panel.textContent).toContain(knowledgeEn.unavailableTitle);
    });
  });

  it("does not write window history when navigating via callbacks", async () => {
    const hrefBefore = window.location.href;
    const onNavigate = vi.fn();

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "home",
          params: {},
          onNavigate,
        }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-nav-chat"));
    });

    expect(onNavigate).toHaveBeenCalled();
    expect(window.location.href).toBe(hrefBefore);
  });

  it("routes documents documentId to the detail page", async () => {
    const bases = makeBasesApi(
      [
        {
          id: "b1",
          name: "Alpha",
          description: null,
          status: "active",
          visibility: "private",
        },
      ],
      {
        files: [
          {
            id: "sf-1",
            knowledgeBaseId: "b1",
            fileName: "handbook.pdf",
            status: "active",
            activeVersionId: "sf-1-v1",
            archivedAt: null,
          },
        ],
      },
    );
    mockJobs({
      capability: { available: true, status: "available" },
      mode: {
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      },
      bases,
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "documents",
          params: { knowledgeBaseId: "b1", documentId: "sf-1" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-document-detail-page")).toBeTruthy();
    });
    expect(screen.queryByTestId("knowledge-documents-page")).toBeNull();
    expect(screen.getByTestId("knowledge-document-detail")).toBeTruthy();
  });

  it("routes sets knowledgeSetId to the detail page", async () => {
    const sets = makeSetsApi([
      {
        id: "set-9",
        name: "Set Nine",
        description: null,
        status: "active",
        visibility: "organization",
        usageCount: 0,
        knowledgeBases: [],
      },
    ]);
    mockJobs({
      capability: { available: true, status: "available" },
      mode: {
        dataMode: "provider",
        allowSyntheticData: false,
        configSource: "default",
      },
      sets,
    });

    await act(async () => {
      render(
        React.createElement(KnowledgePages, {
          page: "sets",
          params: { knowledgeSetId: "set-9" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("knowledge-set-detail")).toBeTruthy();
    });
    expect(screen.queryByTestId("knowledge-sets-page")).toBeNull();
  });

  it("rechecks host and detail capability so the file picker works after the service recovers", async () => {
    const bases = makeBasesApi([
      {
        id: "kb-recovered",
        name: "Alpha",
        description: null,
        status: "active",
        visibility: "private",
      },
    ]);
    mockJobs({ bases });
    const api = window.hermesAPI.knowledgeJobs;
    let available = false;
    api.getCapability = vi.fn(
      async (): Promise<KnowledgeCapabilitySnapshot> => ({
        available,
        status: available ? "available" : "blocked_provider_unavailable",
      }),
    );
    api.pickAndUpload = vi.fn(async () => ({ batchId: null, jobs: [] }));
    const scope = createKnowledgeRouteScope({
      initial: { page: "bases", params: { knowledgeBaseId: "kb-recovered" } },
    });
    render(React.createElement(KnowledgeView, { active: true, scope }));
    await waitFor(() =>
      expect(screen.getByTestId("knowledge-base-recheck")).toBeTruthy(),
    );
    expect(screen.getByTestId("knowledge-base-upload")).toBeDisabled();
    available = true;
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-base-recheck")),
    );
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-base-upload")).not.toBeDisabled();
      expect(
        screen.getByTestId("knowledge-page-bases").getAttribute("data-state"),
      ).toBe("empty");
    });
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-base-upload")),
    );
    await waitFor(() =>
      expect(screen.getByTestId("knowledge-upload-picker")).not.toBeDisabled(),
    );
    await act(async () =>
      fireEvent.click(screen.getByTestId("knowledge-upload-picker")),
    );
    expect(api.pickAndUpload).toHaveBeenCalledWith({
      knowledgeBaseId: "kb-recovered",
    });
  });

  it("reconciles missed completion when the Knowledge view becomes active with the drawer closed", async () => {
    const files = [
      {
        id: "original-file",
        knowledgeBaseId: "kb-active",
        fileName: "original.pdf",
        status: "active" as const,
      },
    ];
    const bases = makeBasesApi(
      [
        {
          id: "kb-active",
          name: "Alpha",
          description: null,
          status: "active",
          visibility: "private",
        },
      ],
      { files },
    );
    mockJobs({ capability: { available: true, status: "available" }, bases });
    const api = window.hermesAPI.knowledgeJobs;
    let localJobs: KnowledgeJobSnapshot[] = [];
    api.listSnapshots = vi.fn(async () => localJobs);
    const listFiles = vi.spyOn(bases, "listFiles");
    const scope = createKnowledgeRouteScope({
      initial: { page: "bases", params: { knowledgeBaseId: "kb-active" } },
    });
    const view = render(
      React.createElement(KnowledgeView, { active: true, scope }),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("knowledge-base-file-original-file"),
      ).toBeTruthy(),
    );
    expect(screen.queryByTestId("knowledge-upload-panel")).toBeNull();
    await act(async () =>
      view.rerender(
        React.createElement(KnowledgeView, { active: false, scope }),
      ),
    );
    files.push({
      id: "completed-file",
      knowledgeBaseId: "kb-active",
      fileName: "completed.pdf",
      status: "active",
    });
    const completed: KnowledgeJobSnapshot = {
      jobId: "missed-completion",
      knowledgeBaseId: "kb-active",
      status: "completed",
      attempt: 1,
      partition: {
        workProfileId: "default",
        authSubject: "user-1",
        tenantScope: { kind: "personal" },
      },
      dataMode: "provider",
      synthetic: false,
      revision: 2,
      updatedAt: "2026-10-08T00:00:00Z",
    };
    localJobs = [completed];
    const callsBeforeReturn = listFiles.mock.calls.length;
    await act(async () =>
      view.rerender(
        React.createElement(KnowledgeView, { active: true, scope }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("knowledge-base-file-completed-file"),
      ).toBeTruthy(),
    );
    expect(listFiles.mock.calls.length).toBe(callsBeforeReturn + 1);
    expect(api.listSnapshots).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("knowledge-upload-panel")).toBeNull();
  });

  it.each(["profile", "account", "tenant", "logout"] as const)(
    "clears cached files and uploads on %s change and ignores old asynchronous snapshots",
    async (change) => {
      let authState: DesktopAuthState = {
        authenticated: true,
        endpointConfig: null,
        expiresAt: null,
        user: { id: "user-1", username: "alice", tenantId: "tenant-1" },
      };
      let authChanged!: (state: DesktopAuthState) => void;
      const files = [
        {
          id: "old-source",
          knowledgeBaseId: "kb-1",
          fileName: "old-source.pdf",
          status: "active" as const,
        },
      ];
      const bases = makeBasesApi(
        [
          {
            id: "kb-1",
            name: "Alpha",
            description: null,
            status: "active",
            visibility: "private",
          },
        ],
        { files },
      );
      mockJobs({
        capability: { available: true, status: "available" },
        mode: { dataMode: "provider", allowSyntheticData: false },
        bases,
      });
      window.desktopAuth.getState = async () => authState;
      window.desktopAuth.onStateChanged = (listener) => {
        authChanged = listener;
        return () => undefined;
      };
      const api = window.hermesAPI.knowledgeJobs;
      const callbacks = new Set<(snapshot: KnowledgeJobSnapshot) => void>();
      api.onSnapshotChanged = (listener) => {
        callbacks.add(listener);
        return () => {
          callbacks.delete(listener);
        };
      };
      const oldJob: KnowledgeJobSnapshot = {
        jobId: "old-job",
        knowledgeBaseId: "kb-1",
        status: "queued",
        attempt: 1,
        partition: {
          workProfileId: "profile-a",
          authSubject: "user-1",
          tenantScope: { kind: "tenant", tenantId: "tenant-1" },
        },
        dataMode: "provider",
        synthetic: false,
        progress: 0,
        revision: 1,
        batchId: "old-batch",
        fileSummary: { displayName: "old-upload.pdf" },
        updatedAt: "2026-01-01T00:00:00Z",
      };
      const newJob = {
        ...oldJob,
        jobId: "new-job",
        batchId: "new-batch",
        fileSummary: { displayName: "new-upload.pdf" },
      };
      let resolveOldList!: (jobs: KnowledgeJobSnapshot[]) => void;
      api.listSnapshots = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<KnowledgeJobSnapshot[]>((resolve) => {
              resolveOldList = resolve;
            }),
        )
        .mockResolvedValue([newJob]);
      const scope = createKnowledgeRouteScope({
        initial: { page: "bases", params: { knowledgeBaseId: "kb-1" } },
      });
      const props = { active: true, profile: "profile-a", scope };
      const view = render(React.createElement(KnowledgeView, props));
      await waitFor(() =>
        expect(
          screen.getByTestId("knowledge-base-file-old-source"),
        ).toBeTruthy(),
      );
      await act(async () =>
        fireEvent.click(screen.getByTestId("knowledge-base-upload")),
      );
      await waitFor(() => expect(resolveOldList).toBeTruthy());
      const oldCallbacks = [...callbacks];
      await act(async () => {
        for (const callback of callbacks) callback(oldJob);
      });
      await waitFor(() =>
        expect(
          screen.getByTestId("knowledge-upload-batch-old-batch"),
        ).toBeTruthy(),
      );

      await act(async () =>
        authChanged({ ...authState, expiresAt: "2099-01-01T00:00:00Z" }),
      );
      expect(
        screen.getByTestId("knowledge-upload-batch-old-batch"),
      ).toBeTruthy();
      files.length = 0;
      if (change === "profile") {
        await act(async () =>
          view.rerender(
            React.createElement(KnowledgeView, {
              ...props,
              profile: "profile-b",
            }),
          ),
        );
      } else {
        authState =
          change === "logout"
            ? { ...authState, authenticated: false, user: null }
            : {
                ...authState,
                user: {
                  ...authState.user!,
                  ...(change === "account"
                    ? { id: "user-2" }
                    : { tenantId: "tenant-2" }),
                },
              };
        if (change === "logout")
          api.getCapability = async () => ({
            available: false,
            status: "auth_required",
          });
        await act(async () => authChanged(authState));
      }
      expect(
        screen.queryByTestId("knowledge-upload-batch-old-batch"),
      ).toBeNull();
      expect(screen.queryByTestId("knowledge-base-file-old-source")).toBeNull();
      await act(async () => {
        resolveOldList([oldJob]);
        for (const callback of oldCallbacks)
          callback({ ...oldJob, revision: 2, status: "completed" });
      });
      expect(document.body.textContent).not.toContain("old-upload.pdf");
      expect(document.body.textContent).not.toContain("old-source.pdf");
      if (change === "logout") {
        await waitFor(() =>
          expect(
            screen
              .getByTestId("knowledge-page-bases")
              .getAttribute("data-state"),
          ).toBe("unavailable"),
        );
      } else {
        await waitFor(() =>
          expect(
            screen.getByTestId("knowledge-base-upload"),
          ).not.toBeDisabled(),
        );
        await act(async () =>
          fireEvent.click(screen.getByTestId("knowledge-base-upload")),
        );
        await waitFor(() =>
          expect(
            screen.getByTestId("knowledge-upload-batch-new-batch"),
          ).toBeTruthy(),
        );
        expect(screen.queryByTestId("knowledge-upload-job-old-job")).toBeNull();
      }
    },
  );

  it.each([null, "session-a"])(
    "retains the actual draft and conversation across internal page switches (session %s)",
    async (sessionId) => {
      window.hermesAPI.getSessionKnowledgeContext = vi.fn(async (id) => ({
        sessionId: id,
        profileId: "default",
        sessionKind: "kb-set",
        executionProvider: "hermes-chat",
        knowledgeSetId: "set-a",
      }));
      const params = {
        ...(sessionId ? { sessionId } : {}),
        knowledgeSetId: "set-a",
      };
      const scope = createKnowledgeRouteScope({
        initial: { page: "chat", params },
      });
      await act(async () => {
        render(React.createElement(KnowledgeView, { active: true, scope }));
      });
      const input = document.querySelector<HTMLTextAreaElement>(
        "textarea.chat-input",
      )!;
      expect(input).toBeTruthy();
      fireEvent.change(input, {
        target: { value: "keep this unsent question" },
      });
      const original = document.querySelector("[data-knowledge-run]");
      for (const page of ["documents", "sets", "chat"]) {
        await act(async () => {
          fireEvent.click(screen.getByTestId(`knowledge-nav-${page}`));
        });
        if (page !== "chat")
          fireEvent.keyDown(window, { key: "n", ctrlKey: true });
      }
      expect(document.querySelector("textarea.chat-input")).toBe(input);
      expect(input).toHaveValue("keep this unsent question");
      expect(document.querySelectorAll("[data-knowledge-run]")).toHaveLength(1);
      expect(document.querySelector("[data-knowledge-run]")).toBe(original);
      expect(scope.getSnapshot().current).toEqual({ page: "chat", params });
    },
  );

  it("keeps background session binding on the documents page and restores it on return", async () => {
    let started!: Parameters<typeof window.hermesAPI.onChatSessionStarted>[0];
    window.hermesAPI.onChatSessionStarted = vi.fn((listener) => {
      started = listener;
      return () => undefined;
    });
    window.hermesAPI.getSessionKnowledgeContext = vi.fn(async (id) => ({
      sessionId: id,
      profileId: "default",
      sessionKind: "kb-set",
      executionProvider: "hermes-chat",
      knowledgeSetId: "set-a",
    }));
    const scope = createKnowledgeRouteScope({
      initial: { page: "chat", params: { knowledgeSetId: "set-a" } },
    });
    await act(async () => {
      render(React.createElement(KnowledgeView, { active: true, scope }));
    });
    const original = document.querySelector<HTMLElement>(
      "[data-knowledge-run]",
    )!;
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-nav-documents"));
    });
    await act(async () => {
      started(original.dataset.knowledgeRun!, "session-created");
    });
    expect(scope.getSnapshot().current.page).toBe("documents");
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-nav-chat"));
    });
    expect(scope.getSnapshot().current).toEqual({
      page: "chat",
      params: { sessionId: "session-created", knowledgeSetId: "set-a" },
    });
    expect(document.querySelector("[data-knowledge-run]")).toBe(original);
  });

  it("clears the chat draft and route history on profile change", async () => {
    const scope = createKnowledgeRouteScope({
      initial: { page: "chat", params: { knowledgeSetId: "set-a" } },
    });
    const props = { active: true, profile: "profile-a", scope };
    const view = render(React.createElement(KnowledgeView, props));
    await waitFor(() =>
      expect(document.querySelector("textarea.chat-input")).toBeTruthy(),
    );
    const input = document.querySelector<HTMLTextAreaElement>(
      "textarea.chat-input",
    )!;
    fireEvent.change(input, { target: { value: "private draft" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-nav-documents"));
    });
    await act(async () => {
      view.rerender(
        React.createElement(KnowledgeView, { ...props, profile: "profile-b" }),
      );
    });
    expect(scope.getSnapshot().backStack).toHaveLength(0);
    await act(async () => {
      fireEvent.click(screen.getByTestId("knowledge-nav-chat"));
    });
    expect(document.querySelector("textarea.chat-input")).not.toBe(input);
    expect(document.querySelector("textarea.chat-input")).toHaveValue("");
    expect(scope.getSnapshot().current.params).toEqual({});
  });

  it("does not restore an old account when the initial auth read arrives after an identity push", async () => {
    let resolveAuth!: (state: DesktopAuthState) => void;
    let authChanged!: (state: DesktopAuthState) => void;
    window.desktopAuth.getState = () =>
      new Promise((resolve) => {
        resolveAuth = resolve;
      });
    window.desktopAuth.onStateChanged = (listener) => {
      authChanged = listener;
      return () => undefined;
    };
    render(React.createElement(KnowledgeView, { active: false }));
    const latest: DesktopAuthState = {
      authenticated: true,
      endpointConfig: null,
      expiresAt: null,
      user: { id: "new-user", username: "new" },
    };
    await act(async () => authChanged(latest));
    await act(async () =>
      resolveAuth({ ...latest, user: { id: "old-user", username: "old" } }),
    );
    expect(
      screen.getByTestId("knowledge-view").getAttribute("data-auth-subject"),
    ).toBe("new-user");
  });
});
