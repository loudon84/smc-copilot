// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  screen,
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
};

function row(overrides: Partial<CacheRow> = {}): CacheRow {
  return {
    id: "sess-live",
    title: "Skill session title",
    startedAt: 1_700_000_000,
    source: "cli",
    messageCount: 1,
    model: "test-model",
    contextFolder: null,
    ...overrides,
  };
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
