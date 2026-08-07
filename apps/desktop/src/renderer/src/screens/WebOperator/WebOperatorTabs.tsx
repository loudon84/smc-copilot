import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { WebOperatorTab } from "../../../../shared/crm-bridge";
import { WEB_OPERATOR_LAYER_ID } from "./web-operator-constants";

export interface WebOperatorTabsProps {
  onActiveLayerChange?: (layerId: string) => void;
}

function tabLayerId(tabId: string): string {
  return tabId === "default" ? WEB_OPERATOR_LAYER_ID : `web-operator-tab-${tabId}`;
}

const DEFAULT_NEW_TAB_URL = "http://localhost:3000/";

function statusDotClass(status: WebOperatorTab["status"], kind: WebOperatorTab["kind"]): string {
  if (status === "loading") return "bg-amber-400 animate-pulse";
  if (status === "failed") return "bg-red-400";
  if (kind === "host-callback") return "bg-sky-400";
  return "bg-emerald-400/80";
}

export function WebOperatorTabs({
  onActiveLayerChange,
}: WebOperatorTabsProps): React.JSX.Element {
  const [tabs, setTabs] = useState<WebOperatorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState("default");
  const [newTabUrl, setNewTabUrl] = useState(DEFAULT_NEW_TAB_URL);
  const [composingNewTab, setComposingNewTab] = useState(false);

  const syncTabs = useCallback(async () => {
    const list = await window.aiosBrowser.listWebOperatorTabs();
    const active = await window.aiosBrowser.getActiveWebOperatorTab();
    setTabs(list);
    setActiveTabId(active.activeTabId);
    onActiveLayerChange?.(active.layerId);
  }, [onActiveLayerChange]);

  useEffect(() => {
    void syncTabs();
    return window.aiosBrowser.onWebOperatorTabsChanged((payload) => {
      setTabs(payload.tabs);
      setActiveTabId(payload.activeTabId);
      onActiveLayerChange?.(tabLayerId(payload.activeTabId));
    });
  }, [onActiveLayerChange, syncTabs]);

  const handleActivate = useCallback(
    async (tabId: string) => {
      await window.aiosBrowser.activateWebOperatorTab(tabId);
      onActiveLayerChange?.(tabLayerId(tabId));
      await syncTabs();
    },
    [onActiveLayerChange, syncTabs],
  );

  const handleClose = useCallback(
    async (tabId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      await window.aiosBrowser.closeWebOperatorTab(tabId);
      await syncTabs();
    },
    [syncTabs],
  );

  const startComposingNewTab = useCallback(() => {
    setNewTabUrl(DEFAULT_NEW_TAB_URL);
    setComposingNewTab(true);
  }, []);

  const cancelComposingNewTab = useCallback(() => {
    setComposingNewTab(false);
  }, []);

  const submitNewTab = useCallback(async () => {
    const url = newTabUrl.trim();
    if (!url) return;
    setComposingNewTab(false);
    await window.aiosBrowser.createWebOperatorTab({ url, activate: true });
    await syncTabs();
  }, [newTabUrl, syncTabs]);

  const newTabControls = composingNewTab ? (
    <div className="web-operator-tabs__compose">
      <input
        type="url"
        value={newTabUrl}
        onChange={(e) => setNewTabUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submitNewTab();
          if (e.key === "Escape") cancelComposingNewTab();
        }}
        className="web-operator-tabs__compose-input"
        placeholder="https://"
        aria-label="New tab URL"
        autoFocus
      />
      <button type="button" className="web-operator-tabs__compose-go" onClick={() => void submitNewTab()}>
        Open
      </button>
      <button type="button" className="web-operator-tabs__compose-cancel" onClick={cancelComposingNewTab}>
        Cancel
      </button>
    </div>
  ) : (
    <button
      type="button"
      className="web-operator-tabs__new"
      onClick={startComposingNewTab}
      title="New tab"
    >
      <Plus size={14} />
    </button>
  );

  if (tabs.length <= 1 && tabs.every((t) => t.tabId === "default" && !t.url)) {
    return (
      <div className="web-operator-tabs web-operator-tabs--empty">
        {newTabControls}
      </div>
    );
  }

  return (
    <div className="web-operator-tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.tabId === activeTabId;
        return (
          <button
            key={tab.tabId}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`web-operator-tabs__tab${isActive ? " is-active" : ""}${
              tab.kind === "host-callback" ? " is-host-callback" : ""
            }`}
            onClick={() => void handleActivate(tab.tabId)}
          >
            <span
              className={`web-operator-tabs__dot ${statusDotClass(tab.status, tab.kind)}`}
              aria-hidden
            />
            {tab.status === "loading" ? (
              <Loader2 size={12} className="web-operator-tabs__spin shrink-0" />
            ) : null}
            <span className="web-operator-tabs__title truncate">{tab.title}</span>
            {tab.tabId !== "default" ? (
              <span
                role="button"
                tabIndex={0}
                className="web-operator-tabs__close"
                onClick={(e) => void handleClose(tab.tabId, e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleClose(tab.tabId, e as unknown as React.MouseEvent);
                }}
                aria-label="Close tab"
              >
                <X size={12} />
              </span>
            ) : null}
          </button>
        );
      })}
      {newTabControls}
    </div>
  );
}
