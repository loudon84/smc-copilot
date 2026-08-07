import "./main-page.css";
import type { ShellViewSnapshot } from "../../../../shared/shell/shell-view-contract";
import type { ProfileEntrySummary } from "../../../../shared/profile-runtime/profile-runtime-contract";
import type { UpdateState, View } from "../../types/desktop-shell";
import type { ExternalBrowserTab, SidebarMode } from "./main-page-types";
import type { SettingsDrawerPanel } from "../SettingsDrawer/settings-drawer-types";
import { DesktopSidebar } from "../../components/layout/DesktopSidebar";
import { MainTopBar } from "./MainTopBar";
import { MainPageDebugPanel } from "./MainPageDebugPanel";
import type { KeepAliveEntry } from "../../components/layout/useKeepAliveRegistry";
import { hasGlobalSecondaryNav } from "../../workspace/has-global-secondary-nav";

export interface MainPageProps {
  outlet: React.ReactNode;
  statusBar?: React.ReactNode;
  modalLayer?: React.ReactNode;
  drawerLayer?: React.ReactNode;
  activeProfile: string;
  activeView: View;
  profileEntries: ProfileEntrySummary[];
  externalTabs: ExternalBrowserTab[];
  tabOrder: string[];
  sidebarMode: SidebarMode;
  metadataById: Record<string, ShellViewSnapshot>;
  keepAliveEntries: Record<string, KeepAliveEntry>;
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
  secondaryPanel?: string;
  onSecondaryPanelChange?: (panel: string) => void;
  updateState: UpdateState;
  updateError: string | null;
  updateVersion: string | null;
  downloadPercent: number;
  onUpdate: () => Promise<void>;
}

export function MainPage({
  outlet,
  statusBar,
  modalLayer,
  drawerLayer,
  activeProfile,
  activeView,
  profileEntries,
  externalTabs,
  tabOrder,
  sidebarMode,
  metadataById,
  keepAliveEntries,
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
  secondaryPanel,
  onSecondaryPanelChange,
  updateState,
  updateError,
  updateVersion,
  downloadPercent,
  onUpdate,
}: MainPageProps): React.JSX.Element {
  // topbar 不显示子菜单
  const globalSecondaryNav = false; // hasGlobalSecondaryNav(activeView);
  const showGlobalSidebar = false; // globalSecondaryNav && sidebarMode !== "hidden";

  return (
    <div
      className={`MainPage layout MainPage--sidebar-${sidebarMode}${showGlobalSidebar ? "" : " MainPage--no-global-sidebar"}`}
    >
      <MainTopBar
        activeProfile={activeProfile}
        activeView={activeView}
        profileEntries={profileEntries}
        externalTabs={externalTabs}
        tabOrder={tabOrder}
        sidebarMode={sidebarMode}
        metadataById={metadataById}
        canCloseActiveTab={canCloseActiveTab}
        canNavigateShell={canNavigateShell}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onSidebarModeChange={onSidebarModeChange}
        onNavigate={onNavigate}
        onTabOrderChange={onTabOrderChange}
        onCloseTab={onCloseTab}
        onRecoverTab={onRecoverTab}
        onOpenExternalTab={onOpenExternalTab}
        onReloadActiveTab={onReloadActiveTab}
        onStopActiveTab={onStopActiveTab}
        onBackActiveTab={onBackActiveTab}
        onForwardActiveTab={onForwardActiveTab}
        onCloseActiveTab={onCloseActiveTab}
        onOpenSettingsDrawer={onOpenSettingsDrawer}
        showSidebarToggle={globalSecondaryNav}
      />
      <div className="MainPage__body">
        {/*
        {showGlobalSidebar ? (
          <aside className="MainPage__sidebar">
            <DesktopSidebar
              mode={sidebarMode}
              workspaceId={activeView}
              secondaryPanel={secondaryPanel}
              onSecondaryPanelChange={onSecondaryPanelChange}
              updateState={updateState}
              updateError={updateError}
              updateVersion={updateVersion}
              downloadPercent={downloadPercent}
              onUpdate={onUpdate}
            />
          </aside>
        ) : null}
        */}
        <main className="MainPage__content">{outlet}</main>
      </div>

      {/* 
      {statusBar ? <footer className="MainPage__status">{statusBar}</footer> : null} 
      <MainPageDebugPanel
        metadataById={metadataById}
        keepAliveEntries={keepAliveEntries}
      />
      */}
      {modalLayer}
      {drawerLayer}
    </div>
  );
}
