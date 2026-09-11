// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

vi.mock("./SidebarSessionMenu", () => ({
  default: (): null => null,
}));

import SidebarRecentSessions from "./SidebarRecentSessions";

type CacheRow = {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  contextFolder: string | null;
  sessionKind?: string;
  executionProvider?: string;
};

const PINNED_IDS_KEY = "hermes.sidebar.pinnedSessions";

function row(overrides: Partial<CacheRow> = {}): CacheRow {
  return {
    id: "sess-live",
    title: "Skill session title",
    startedAt: 1_700_000_000,
    source: "cli",
    messageCount: 1,
    model: "test-model",
    contextFolder: null,
    sessionKind: "work",
    executionProvider: "skill-run",
    ...overrides,
  };
}

function chatRow(overrides: Partial<CacheRow> = {}): CacheRow {
  return row({
    id: "sess-chat",
    title: "Original chat",
    sessionKind: "chat",
    executionProvider: "hermes-chat",
    ...overrides,
  });
}

async function flushPaint(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function historySection(labelKey: string): HTMLElement {
  const toggle = screen.getByRole("button", { name: labelKey });
  const section = toggle.closest(".sidebar-recent-section");
  if (!(section instanceof HTMLElement)) {
    throw new Error(`missing history section ${labelKey}`);
  }
  return section;
}

function installHermesAPI(initial: CacheRow[] = []): {
  listCachedSessions: ReturnType<typeof vi.fn>;
  syncSessionCache: ReturnType<typeof vi.fn>;
  onSessionCacheChanged: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  emit: (event: unknown) => void;
  setRows: (next: CacheRow[]) => void;
  setListDelayMs: (ms: number) => void;
} {
  let rows = initial;
  let listDelayMs = 0;
  let listener: ((event: unknown) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    listener = null;
  });
  const listCachedSessions = vi.fn(
    () =>
      new Promise<CacheRow[]>((resolve) => {
        if (listDelayMs <= 0) {
          resolve(rows);
          return;
        }
        setTimeout(() => resolve(rows), listDelayMs);
      }),
  );
  const syncSessionCache = vi.fn(async () => rows);
  const onSessionCacheChanged = vi.fn((callback: (event: unknown) => void) => {
    listener = callback;
    return unsubscribe;
  });
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      listCachedSessions,
      syncSessionCache,
      onSessionCacheChanged,
      updateSessionTitle: vi.fn().mockResolvedValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      setSessionContextFolder: vi.fn().mockResolvedValue(undefined),
      selectFolder: vi.fn().mockResolvedValue(null),
    },
  });
  return {
    listCachedSessions,
    syncSessionCache,
    onSessionCacheChanged,
    unsubscribe,
    emit: (event: unknown) => {
      listener?.(event);
    },
    setRows: (next: CacheRow[]) => {
      rows = next;
    },
    setListDelayMs: (ms: number) => {
      listDelayMs = ms;
    },
  };
}

function renderSidebar(
  overrides: Partial<ComponentProps<typeof SidebarRecentSessions>> = {},
): ReturnType<typeof render> {
  return render(
    <SidebarRecentSessions
      open
      activeProfile="default"
      currentSessionId={null}
      loadingSessionIds={new Set()}
      resumingSessionId={null}
      onSelect={() => {}}
      scrollRootRef={createRef<HTMLDivElement | null>()}
      {...overrides}
    />,
  );
}

describe("SidebarRecentSessions cache-only live sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("applies a cache list within 500ms and never syncs on the event path", async () => {
    const api = installHermesAPI([]);
    renderSidebar();
    await act(async () => {
      await Promise.resolve();
    });
    const syncAfterOpen = api.syncSessionCache.mock.calls.length;
    expect(api.onSessionCacheChanged).toHaveBeenCalledTimes(1);

    api.setRows([row()]);
    api.setListDelayMs(50);
    await act(async () => {
      api.emit({ sessionId: "sess-live", reason: "created" });
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText("Skill session title")).toBeTruthy();
    expect(api.listCachedSessions.mock.calls.length).toBeGreaterThan(1);
    expect(api.syncSessionCache.mock.calls.length).toBe(syncAfterOpen);
  });

  it("ignores invalid payloads and does no work when closed", async () => {
    const api = installHermesAPI([]);
    const view = renderSidebar({ open: false });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.onSessionCacheChanged).not.toHaveBeenCalled();
    expect(api.listCachedSessions).not.toHaveBeenCalled();
    expect(api.syncSessionCache).not.toHaveBeenCalled();

    view.rerender(
      <SidebarRecentSessions
        open
        activeProfile="default"
        currentSessionId={null}
        loadingSessionIds={new Set()}
        resumingSessionId={null}
        onSelect={() => {}}
        scrollRootRef={createRef<HTMLDivElement | null>()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const listAfterOpen = api.listCachedSessions.mock.calls.length;
    const syncAfterOpen = api.syncSessionCache.mock.calls.length;

    api.setRows([row({ title: "Should not appear" })]);
    await act(async () => {
      api.emit({
        sessionId: "sess-live",
        reason: "created",
        prompt: "secret",
      });
      await Promise.resolve();
    });
    expect(api.listCachedSessions.mock.calls.length).toBe(listAfterOpen);
    expect(api.syncSessionCache.mock.calls.length).toBe(syncAfterOpen);
    expect(screen.queryByText("Should not appear")).toBeNull();
  });

  it("unsubscribes on close and profile change, and a burst still skips full sync", async () => {
    const api = installHermesAPI([]);
    const view = renderSidebar();
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.onSessionCacheChanged).toHaveBeenCalledTimes(1);
    const syncAfterOpen = api.syncSessionCache.mock.calls.length;

    api.setRows([row(), row({ id: "sess-2", title: "Second" })]);
    await act(async () => {
      api.emit({ sessionId: "sess-live", reason: "created" });
      api.emit({ sessionId: "sess-2", reason: "created" });
      api.emit({ sessionId: "sess-live", reason: "updated" });
      await Promise.resolve();
    });
    expect(screen.getByText("Skill session title")).toBeTruthy();
    expect(api.syncSessionCache.mock.calls.length).toBe(syncAfterOpen);

    view.rerender(
      <SidebarRecentSessions
        open
        activeProfile="other"
        currentSessionId={null}
        loadingSessionIds={new Set()}
        resumingSessionId={null}
        onSelect={() => {}}
        scrollRootRef={createRef<HTMLDivElement | null>()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.unsubscribe).toHaveBeenCalled();
    expect(api.onSessionCacheChanged.mock.calls.length).toBeGreaterThan(1);

    view.rerender(
      <SidebarRecentSessions
        open={false}
        activeProfile="other"
        currentSessionId={null}
        loadingSessionIds={new Set()}
        resumingSessionId={null}
        onSelect={() => {}}
        scrollRootRef={createRef<HTMLDivElement | null>()}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.unsubscribe.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("SidebarRecentSessions classified history", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("places exact pairs under Chat history or Work history and exposes English heading names", async () => {
    installHermesAPI([
      chatRow(),
      row({ id: "sess-work", title: "Accepted skill run" }),
    ]);
    renderSidebar();
    await flushPaint();
    await act(async () => {
      await Promise.resolve();
    });

    const chat = historySection("navigation.chatHistory");
    const work = historySection("navigation.workHistory");
    expect(within(chat).getByText("Original chat")).toBeTruthy();
    expect(within(work).getByText("Accepted skill run")).toBeTruthy();
    expect(within(chat).queryByText("Accepted skill run")).toBeNull();
    expect(within(work).queryByText("Original chat")).toBeNull();
  });

  it("omits missing, partial, cross-paired, unknown, and third-class rows from classified history", async () => {
    installHermesAPI([
      chatRow(),
      row({ id: "missing", title: "Missing pair", sessionKind: undefined, executionProvider: undefined }),
      row({
        id: "partial",
        title: "Partial pair",
        sessionKind: "work",
        executionProvider: undefined,
      }),
      row({
        id: "cross",
        title: "Cross pair",
        sessionKind: "chat",
        executionProvider: "skill-run",
      }),
      row({
        id: "unknown",
        title: "Unknown pair",
        sessionKind: "other",
        executionProvider: "elsewhere",
      }),
      row({
        id: "third",
        title: "Expert task",
        sessionKind: "expert",
        executionProvider: "hermes-task",
      }),
    ]);
    renderSidebar();
    await flushPaint();
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Original chat")).toBeTruthy();
    expect(screen.queryByText("Missing pair")).toBeNull();
    expect(screen.queryByText("Partial pair")).toBeNull();
    expect(screen.queryByText("Cross pair")).toBeNull();
    expect(screen.queryByText("Unknown pair")).toBeNull();
    expect(screen.queryByText("Expert task")).toBeNull();
    expect(screen.queryByRole("button", { name: "navigation.workHistory" })).toBeNull();
  });

  it("keeps one row per id with Pinned then Projects then Chat then Work precedence", async () => {
    localStorage.setItem(PINNED_IDS_KEY, JSON.stringify(["sess-pinned"]));
    installHermesAPI([
      chatRow({ id: "sess-pinned", title: "Pinned chat" }),
      row({
        id: "sess-project",
        title: "Project skill run",
        contextFolder: "E:/repos/demo",
      }),
      chatRow({ id: "sess-plain-chat", title: "Loose chat" }),
      row({ id: "sess-plain-work", title: "Loose skill run" }),
    ]);
    renderSidebar();
    await flushPaint();
    await act(async () => {
      await Promise.resolve();
    });

    const pinned = historySection("navigation.pinned");
    const projects = historySection("navigation.projects");
    const chat = historySection("navigation.chatHistory");
    const work = historySection("navigation.workHistory");

    expect(within(pinned).getByText("Pinned chat")).toBeTruthy();
    expect(within(projects).getByText("Project skill run")).toBeTruthy();
    expect(within(chat).getByText("Loose chat")).toBeTruthy();
    expect(within(work).getByText("Loose skill run")).toBeTruthy();

    expect(within(chat).queryByText("Pinned chat")).toBeNull();
    expect(within(chat).queryByText("Project skill run")).toBeNull();
    expect(within(work).queryByText("Pinned chat")).toBeNull();
    expect(within(work).queryByText("Project skill run")).toBeNull();
    expect(screen.getAllByText("Pinned chat")).toHaveLength(1);
    expect(screen.getAllByText("Project skill run")).toHaveLength(1);
  });

  it("moves a row into Projects when contextFolder is set without changing the pair", async () => {
    const api = installHermesAPI([
      row({ id: "sess-work", title: "Accepted skill run" }),
    ]);
    renderSidebar();
    await flushPaint();
    await act(async () => {
      await Promise.resolve();
    });
    expect(within(historySection("navigation.workHistory")).getByText("Accepted skill run")).toBeTruthy();

    api.setRows([
      row({
        id: "sess-work",
        title: "Accepted skill run",
        contextFolder: "E:/repos/demo",
      }),
    ]);
    await act(async () => {
      api.emit({ sessionId: "sess-work", reason: "updated" });
      await Promise.resolve();
    });

    expect(within(historySection("navigation.projects")).getByText("Accepted skill run")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "navigation.workHistory" })).toBeNull();
    expect(screen.getAllByText("Accepted skill run")).toHaveLength(1);
  });

  it("publishes an accepted Skill Run from a cache-only event without a Main DB sync", async () => {
    const api = installHermesAPI([chatRow()]);
    renderSidebar();
    await flushPaint();
    await act(async () => {
      await Promise.resolve();
    });
    const syncAfterOpen = api.syncSessionCache.mock.calls.length;

    api.setRows([
      chatRow(),
      row({ id: "sess-work", title: "Accepted skill run" }),
    ]);
    await act(async () => {
      api.emit({ sessionId: "sess-work", reason: "created" });
      await Promise.resolve();
    });

    expect(within(historySection("navigation.workHistory")).getByText("Accepted skill run")).toBeTruthy();
    expect(screen.getAllByText("Accepted skill run")).toHaveLength(1);
    expect(api.syncSessionCache.mock.calls.length).toBe(syncAfterOpen);
  });

  it("converges to unique rows after repeated cache events and extra page reads", async () => {
    const extra = row({ id: "sess-work", title: "Accepted skill run" });
    const first = Array.from({ length: 30 }, (_, index) =>
      chatRow({ id: `sess-chat-${index}`, title: `Chat ${index}` }),
    );
    const api = installHermesAPI([extra, ...first]);
    renderSidebar();
    await flushPaint();
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      api.emit({ sessionId: "sess-work", reason: "created" });
      api.emit({ sessionId: "sess-work", reason: "updated" });
      await Promise.resolve();
    });

    expect(screen.getAllByText("Accepted skill run")).toHaveLength(1);
    expect(screen.getAllByText("Chat 0")).toHaveLength(1);
    expect(api.syncSessionCache.mock.calls.length).toBeGreaterThan(0);
    const syncCount = api.syncSessionCache.mock.calls.length;
    await act(async () => {
      api.emit({ sessionId: "sess-work", reason: "updated" });
      await Promise.resolve();
    });
    expect(screen.getAllByText("Accepted skill run")).toHaveLength(1);
    expect(api.syncSessionCache.mock.calls.length).toBe(syncCount);
  });
});
