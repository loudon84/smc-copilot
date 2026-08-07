import { useCallback, useState } from "react";
import { externalBrowserPartition } from "../../../../shared/shell/browser-partitions";
import type { ExternalBrowserTabState } from "../../../../shared/shell/main-page-state-contract";
import type { View } from "../../types/desktop-shell";
import type { ExternalBrowserTab } from "./main-page-types";

function createTabId(): `external-browser:${string}` {
  return `external-browser:${crypto.randomUUID()}`;
}

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname || "External";
  } catch {
    return "External";
  }
}

export function useExternalBrowserTabs() {
  const [tabs, setTabs] = useState<ExternalBrowserTab[]>([]);

  const openExternalTab = useCallback(async (url: string): Promise<View> => {
    const id = createTabId();
    const now = Date.now();
    const normalizedUrl = url.trim();

    const tab: ExternalBrowserTab = {
      id,
      title: titleFromUrl(normalizedUrl),
      url: normalizedUrl,
      createdAt: now,
      updatedAt: now,
    };

    await window.shellView.create(id, "external-browser", normalizedUrl, {
      layer: "content",
      partition: externalBrowserPartition(id),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });

    setTabs((prev) => [...prev, tab]);
    return id;
  }, []);

  const closeExternalTab = useCallback(
    async (id: `external-browser:${string}`) => {
      await window.shellView.destroy(id);
      setTabs((prev) => prev.filter((tab) => tab.id !== id));
    },
    [],
  );

  const restoreExternalTabs = useCallback(
    async (persisted: ExternalBrowserTabState[]): Promise<void> => {
      const restored: ExternalBrowserTab[] = [];

      for (const item of persisted) {
        try {
          await window.shellView.create(item.id, "external-browser", item.url, {
            layer: "content",
            partition: externalBrowserPartition(item.id),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          });
          restored.push({
            id: item.id,
            title: item.title || titleFromUrl(item.url),
            url: item.url,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          });
        } catch (err) {
          console.warn("[useExternalBrowserTabs] restore tab failed:", item.id, err);
        }
      }

      setTabs(restored);
    },
    [],
  );

  return {
    externalTabs: tabs,
    setExternalTabs: setTabs,
    openExternalTab,
    closeExternalTab,
    restoreExternalTabs,
  };
}
