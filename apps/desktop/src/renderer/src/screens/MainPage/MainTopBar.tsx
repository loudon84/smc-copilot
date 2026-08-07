import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  UserCircle,
  Plus,
  RotateCw,
  X,
  ChevronLeft,
  ChevronRight,
  Square,
} from "lucide-react";
import { WindowControls } from "../../components/layout/WindowControls";
import type { ShellViewSnapshot } from "../../../../shared/shell/shell-view-contract";
import type { ProfileEntrySummary } from "../../../../shared/profile-runtime/profile-runtime-contract";
import type { View } from "../../types/desktop-shell";
import type { ExternalBrowserTab, SidebarMode } from "./main-page-types";
import type { SettingsDrawerPanel } from "../SettingsDrawer/settings-drawer-types";
import { MainViewTabs } from "./MainViewTabs";
import { ServersEntry } from "./ServersEntry";
import { MainRuntimeIndicator } from "./MainRuntimeIndicator";

interface MainTopBarProps {
  activeProfile: string;
  activeView: View;
  profileEntries: ProfileEntrySummary[];
  externalTabs: ExternalBrowserTab[];
  tabOrder: string[];
  sidebarMode: SidebarMode;
  metadataById: Record<string, ShellViewSnapshot>;
  canCloseActiveTab: boolean;
  canNavigateShell: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onSidebarModeChange: (mode: SidebarMode) => void;
  onNavigate: (view: View) => void;
  onTabOrderChange: (order: string[]) => void;
  onCloseTab: (id: View) => void;
  onRecoverTab: (id: View) => void;
  onOpenExternalTab: (url: string) => Promise<View>;
  onReloadActiveTab: () => void;
  onStopActiveTab: () => void;
  onBackActiveTab: () => void;
  onForwardActiveTab: () => void;
  onCloseActiveTab: () => void;
  onOpenSettingsDrawer: (panel?: SettingsDrawerPanel) => void;
  showSidebarToggle?: boolean;
}

function nextSidebarMode(mode: SidebarMode): SidebarMode {
  if (mode === "expanded") return "rail";
  if (mode === "rail") return "hidden";
  return "expanded";
}

function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function MainTopBar({
  activeProfile,
  activeView,
  externalTabs,
  tabOrder,
  sidebarMode,
  metadataById,
  canCloseActiveTab,
  canNavigateShell,
  canGoBack,
  canGoForward,
  onSidebarModeChange,
  onNavigate,
  onTabOrderChange,
  onCloseTab,
  onRecoverTab,
  onOpenExternalTab,
  onReloadActiveTab,
  onStopActiveTab,
  onBackActiveTab,
  onForwardActiveTab,
  onCloseActiveTab,
  onOpenSettingsDrawer,
  showSidebarToggle = true,
}: MainTopBarProps): React.JSX.Element {
  const SidebarIcon = sidebarMode === "hidden" ? PanelLeftOpen : PanelLeftClose;
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [newTabUrl, setNewTabUrl] = useState("https://");
  const newTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!newTabOpen) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (
        newTabRef.current &&
        !newTabRef.current.contains(event.target as Node)
      ) {
        setNewTabOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [newTabOpen]);

  const handleNewTabSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const url = normalizeUrlInput(newTabUrl);
    if (!url) return;

    try {
      const id = await onOpenExternalTab(url);
      onNavigate(id);
      setNewTabOpen(false);
      setNewTabUrl("https://");
    } catch (err) {
      console.error("[MainTopBar] openExternalTab failed:", err);
    }
  };

  return (
    <header className="MainTopBar app-drag-region">
      {showSidebarToggle ? (
        <button
          type="button"
          className="MainTopBar__menu no-drag"
          aria-label="Toggle sidebar"
          title={`Sidebar: ${sidebarMode}`}
          onClick={() => onSidebarModeChange(nextSidebarMode(sidebarMode))}
        >
          <SidebarIcon size={16} />
        </button>
      ) : null}
      <MainViewTabs
        activeView={activeView}
        externalTabs={externalTabs}
        tabOrder={tabOrder}
        metadataById={metadataById}
        onTabOrderChange={onTabOrderChange}
        onNavigate={onNavigate}
        onCloseTab={onCloseTab}
        onRecoverTab={onRecoverTab}
      />
      <div className="MainTopBar__actions no-drag">
        <div className="MainTopBar__new-tab" ref={newTabRef}>
          <button
            type="button"
            aria-label="New browser tab"
            title="New browser tab"
            onClick={() => setNewTabOpen((open) => !open)}
          >
            <Plus size={15} />
          </button>
          {newTabOpen ? (
            <form
              className="MainTopBar__new-tab-popover no-drag"
              onSubmit={handleNewTabSubmit}
            >
              <input
                type="text"
                value={newTabUrl}
                onChange={(e) => setNewTabUrl(e.target.value)}
                placeholder="https://"
                className="MainTopBar__new-tab-input"
                autoFocus
                spellCheck={false}
              />
              <button type="submit" className="MainTopBar__new-tab-go">
                Open
              </button>
            </form>
          ) : null}
        </div>
       
        <button
          type="button"
          aria-label="Reload tab"
          title="Reload tab"
          onClick={onReloadActiveTab}
        >
          <RotateCw size={15} />
        </button>

        {canCloseActiveTab ? (
          <button
            type="button"
            aria-label="Close tab"
            title="Close tab"
            onClick={onCloseActiveTab}
          >
            <X size={15} />
          </button>
        ) : null}

        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => onOpenSettingsDrawer("account")}
        >
          <Settings size={15} />
        </button>
      </div>

      <WindowControls />
    </header>
  );
}
