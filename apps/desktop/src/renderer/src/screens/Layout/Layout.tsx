import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { WorkspaceOutlet } from "../../components/layout/WorkspaceOutlet";
import { StatusBar } from "../../components/layout/StatusBar";
import { useKeepAliveRegistry } from "../../components/layout/useKeepAliveRegistry";
import { KeepAliveView } from "../../components/layout/KeepAliveView";
import { MainPage } from "../MainPage/MainPage";
import type { SidebarMode } from "../MainPage/main-page-types";
import { useExternalBrowserTabs } from "../MainPage/useExternalBrowserTabs";
import { useShellViewMetadata } from "../MainPage/useShellViewMetadata";
import { resolveActiveShellLayerId } from "../MainPage/shell-layer-id";
import type { View } from "../../types/desktop-shell";
import { ModalLayer } from "../../components/layout/ModalLayer";
import { DrawerLayer } from "../../components/layout/DrawerLayer";
import { OverlayProvider } from "../../components/overlay/OverlayProvider";
import { NativeShellLayerGateProvider } from "../../components/overlay/NativeShellLayerGate";
import { ConfigDiffConfirmDrawer } from "../../modules/auth/ConfigDiffConfirmDrawer";
import { SettingsDrawer } from "../SettingsDrawer/SettingsDrawer";
import {
  isSettingsDrawerPanel,
  type SettingsDrawerPanel,
} from "../SettingsDrawer/settings-drawer-types";
import { useAuth } from "../../modules/auth/AuthProvider";
import { useDesktopNavigation } from "../../hooks/useDesktopNavigation";
import { useUpdateState } from "../../hooks/useUpdateState";
import { useRemoteMode } from "../../hooks/useRemoteMode";
import { useProfileEntries } from "../../hooks/useProfileEntries";
import {
  DEFAULT_WEB_OPERATOR_LAYOUT,
  normalizeWebOperatorLayout,
  type MainPagePersistedState,
  type WebOperatorLayoutState,
} from "../../../../shared/shell/main-page-state-contract";
import { defaultSecondaryPanel } from "../../../../shared/workspace/workspace-secondary-nav";
import { isStaticWorkspaceId } from "../../workspace/workspace-registry";
import type { StaticWorkspaceId } from "../../../../shared/workspace/workspace-contract";
import { useShellLayerVisibility } from "../../hooks/useShellLayerVisibility";
import type { CrmBridgeOnEventPayload } from "../../../../shared/crm-bridge";
import { navigateCrmRendererRoute } from "../../crm-bridge/crm-renderer-navigation";
import { WebOperatorScreen } from "../WebOperator/WebOperatorScreen";

function isValidRestoredView(
  view: string | undefined,
  externalTabIds: string[],
): view is View {
  if (!view) return false;

  const known: View[] = [
    "portal",
    "workspaces",
    "local-hermes",
    "task-workbench",
    "web-operator",
    "crm-workbench",
    "office",
  ];

  if (known.includes(view as View)) return true;

  if (view.startsWith("external-browser:") && externalTabIds.includes(view)) {
    return true;
  }

  return false;
}

function Layout(): React.JSX.Element {
  const { pendingBootstrapDiff, setPendingBootstrapDiff } = useAuth();
  const navigation = useDesktopNavigation();
  const {
    updateVersion,
    updateState,
    downloadPercent,
    updateError,
    handleUpdate,
  } = useUpdateState();
  const remoteMode = useRemoteMode(navigation.view);
  const profileEntries = useProfileEntries();
  const metadataById = useShellViewMetadata();
  const keepAliveEntries = useKeepAliveRegistry(String(navigation.view));

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded");
  const [workspaceOrder, setWorkspaceOrder] = useState<string[]>([]);
  const [workspaceSecondaryState, setWorkspaceSecondaryState] = useState<
    Record<string, string>
  >({});
  const [webOperatorLayout, setWebOperatorLayout] = useState<WebOperatorLayoutState>(
    DEFAULT_WEB_OPERATOR_LAYOUT,
  );
  const [hydrated, setHydrated] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<SettingsDrawerPanel>("server");

  /** Opens SettingsDrawer; `server` = global Agent / copilot-serve / profile; `runtime` = per-profile ops. */
  const openSettingsDrawer = useCallback((panel: SettingsDrawerPanel = "server") => {
    setSettingsPanel(panel);
    setSettingsDrawerOpen(true);
  }, []);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { externalTabs, openExternalTab, closeExternalTab, restoreExternalTabs } =
    useExternalBrowserTabs();

  const draggableTabIds = useMemo(
    () => externalTabs.map((t) => t.id as string),
    [externalTabs],
  );

  useShellLayerVisibility(
    navigation.view,
    draggableTabIds,
    hydrated,
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const state = await window.mainPageState.read();
        if (cancelled) return;

        setSidebarMode(state.sidebarMode);
        setWorkspaceOrder(state.workspaceOrder);
        setWorkspaceSecondaryState(state.workspaceSecondaryState ?? {});
        setWebOperatorLayout(normalizeWebOperatorLayout(state.webOperatorLayout));
        await restoreExternalTabs(state.externalTabs);

        const externalIds = state.externalTabs.map((t) => t.id);
        const last = state.lastActiveWorkspace;
        if (isValidRestoredView(last, externalIds)) {
          navigation.navigateToView(last as View);
        } else {
          navigation.navigateToView("portal");
        }

        if (isSettingsDrawerPanel(state.lastSettingsDrawerPanel)) {
          setSettingsPanel(state.lastSettingsDrawerPanel);
        }
      } catch (err) {
        console.warn("[Layout] failed to restore main page state:", err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    setWorkspaceOrder((prev) => {
      const kept = prev.filter((id) => draggableTabIds.includes(id));
      const appended = draggableTabIds.filter((id) => !kept.includes(id));
      return [...kept, ...appended];
    });
  }, [draggableTabIds]);

  const activeStaticWorkspace =
    typeof navigation.view === "string" &&
    isStaticWorkspaceId(navigation.view)
      ? (navigation.view as StaticWorkspaceId)
      : null;

  const secondaryPanel = useMemo(() => {
    if (!activeStaticWorkspace) return undefined;
    const stored = workspaceSecondaryState[activeStaticWorkspace];
    if (stored) return stored;
    return defaultSecondaryPanel(activeStaticWorkspace);
  }, [activeStaticWorkspace, workspaceSecondaryState]);

  const handleSecondaryPanelChange = useCallback(
    (panel: string) => {
      if (!activeStaticWorkspace) return;
      setWorkspaceSecondaryState((prev) => ({
        ...prev,
        [activeStaticWorkspace]: panel,
      }));
    },
    [activeStaticWorkspace],
  );

  useEffect(() => {
    if (!hydrated) return;

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      const payload: MainPagePersistedState = {
        version: 2,
        sidebarMode,
        workspaceOrder,
        externalTabs: externalTabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          createdAt: tab.createdAt,
          updatedAt: tab.updatedAt,
        })),
        lastActiveWorkspace: String(navigation.view),
        lastSettingsDrawerPanel: settingsPanel,
        workspaceSecondaryState,
        webOperatorLayout,
      };
      void window.mainPageState.write(payload).catch((err) => {
        console.warn("[Layout] failed to persist main page state:", err);
      });
    }, 300);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [
    hydrated,
    sidebarMode,
    workspaceOrder,
    externalTabs,
    navigation.view,
    settingsPanel,
    workspaceSecondaryState,
    webOperatorLayout,
  ]);

  const handleWebOperatorLayoutChange = useCallback((next: WebOperatorLayoutState) => {
    setWebOperatorLayout(normalizeWebOperatorLayout(next));
  }, []);

  const activeShellLayerId = resolveActiveShellLayerId(navigation.view);
  const activeMetadata = activeShellLayerId
    ? metadataById[activeShellLayerId]
    : undefined;

  const canCloseActiveTab =
    typeof navigation.view === "string" &&
    navigation.view.startsWith("external-browser:");

  const canNavigateShell = activeShellLayerId !== null;

  const handleCloseTab = useCallback(
    (id: View) => {
      if (typeof id === "string" && id.startsWith("external-browser:")) {
        void closeExternalTab(id as `external-browser:${string}`).then(() => {
          if (navigation.view === id) {
            navigation.navigateToView("portal");
          }
        });
      }
    },
    [closeExternalTab, navigation],
  );

  const runShellNav = useCallback(
    (action: (layerId: string) => Promise<void>) => {
      const layerId = resolveActiveShellLayerId(navigation.view);
      if (!layerId) return;
      void action(layerId);
    },
    [navigation.view],
  );

  const handleReloadActiveTab = useCallback(() => {
    runShellNav((layerId) => window.shellView.reload(layerId));
  }, [runShellNav]);

  const handleStopActiveTab = useCallback(() => {
    runShellNav((layerId) => window.shellView.stopLoading(layerId));
  }, [runShellNav]);

  const handleBackActiveTab = useCallback(() => {
    runShellNav((layerId) => window.shellView.goBack(layerId));
  }, [runShellNav]);

  const handleForwardActiveTab = useCallback(() => {
    runShellNav((layerId) => window.shellView.goForward(layerId));
  }, [runShellNav]);

  const handleRecoverTab = useCallback(
    (id: View) => {
      void window.shellView.recover(String(id));
    },
    [],
  );

  const handleCloseActiveTab = useCallback(() => {
    const active = navigation.view;
    if (typeof active === "string" && active.startsWith("external-browser:")) {
      void closeExternalTab(active as `external-browser:${string}`);
      navigation.navigateToView("portal");
    }
  }, [navigation.view, closeExternalTab, navigation.navigateToView]);

  useEffect(() => {
    try {
      return window.aiosBrowser.onOpened(() => {
        navigation.navigateToView("web-operator");
      });
    } catch {
      return undefined;
    }
  }, [navigation.navigateToView]);

  useEffect(() => {
    const api = window.aiosBrowser as unknown as {
      onCrmEvent?: (cb: (payload: CrmBridgeOnEventPayload) => void) => () => void;
    };

    if (!api.onCrmEvent) return undefined;

    return api.onCrmEvent((payload) => {
      const action = payload.routeAction;
      if (!action?.ok) return;

      if (action.action === "open-renderer-route" && action.route) {
        if (navigateCrmRendererRoute(action.route, payload.event)) {
          navigation.navigateToView("crm-workbench");
        }
        return;
      }

      queueMicrotask(() => {
        navigation.navigateToView("web-operator");

        if (action.focusedPanel) {
          handleSecondaryPanelChange(action.focusedPanel);
        }
      });
    });
  }, [navigation, handleSecondaryPanelChange]);

  if (!hydrated) {
    return (
      <div className="MainPage layout MainPage--sidebar-expanded">
        <main className="MainPage__content" />
      </div>
    );
  }

  const hasLegacyBlockingDrawer =
    settingsDrawerOpen || Boolean(pendingBootstrapDiff?.diff?.length);

  const isWebOperatorActive = navigation.view === "web-operator";

  return (
    <OverlayProvider legacyDrawerBlocking={hasLegacyBlockingDrawer}>
      <NativeShellLayerGateProvider activeView={navigation.view}>
        <MainPage
          activeProfile={navigation.activeProfile}
          activeView={navigation.view}
          profileEntries={profileEntries}
          externalTabs={externalTabs}
          tabOrder={workspaceOrder}
          sidebarMode={sidebarMode}
          metadataById={metadataById}
          keepAliveEntries={keepAliveEntries}
          canCloseActiveTab={canCloseActiveTab}
          canNavigateShell={canNavigateShell}
          canGoBack={activeMetadata?.canGoBack ?? false}
          canGoForward={activeMetadata?.canGoForward ?? false}
          onSidebarModeChange={setSidebarMode}
          onNavigate={navigation.navigateToView}
          onTabOrderChange={setWorkspaceOrder}
          onCloseTab={handleCloseTab}
          onRecoverTab={handleRecoverTab}
          onOpenExternalTab={openExternalTab}
          onReloadActiveTab={handleReloadActiveTab}
          onStopActiveTab={handleStopActiveTab}
          onBackActiveTab={handleBackActiveTab}
          onForwardActiveTab={handleForwardActiveTab}
          onCloseActiveTab={handleCloseActiveTab}
          onOpenSettingsDrawer={openSettingsDrawer}
          secondaryPanel={secondaryPanel}
          onSecondaryPanelChange={handleSecondaryPanelChange}
          updateState={updateState}
          updateError={updateError}
          updateVersion={updateVersion}
          downloadPercent={downloadPercent}
          onUpdate={handleUpdate}
          outlet={
            <>
              <KeepAliveView active={isWebOperatorActive}>
                <WebOperatorScreen
                  enabled={isWebOperatorActive}
                  focusedPanel={secondaryPanel}
                  onFocusedPanelChange={handleSecondaryPanelChange}
                  layout={webOperatorLayout}
                  onLayoutChange={handleWebOperatorLayoutChange}
                />
              </KeepAliveView>

              {!isWebOperatorActive ? (
                <WorkspaceOutlet
                  view={navigation.view}
                  activeProfile={navigation.activeProfile}
                  officeVisited={navigation.officeVisited}
                  onNavigate={navigation.navigateToView}
                  onOpenSettingsDrawer={(panel) => openSettingsDrawer(panel ?? "server")}
                  secondaryPanel={secondaryPanel}
                  onSecondaryPanelChange={handleSecondaryPanelChange}
                  webOperatorLayout={webOperatorLayout}
                  onWebOperatorLayoutChange={handleWebOperatorLayoutChange}
                />
              ) : null}
            </>
          }
          statusBar={
            <StatusBar
              activeProfile={navigation.activeProfile}
              remoteMode={remoteMode}
              updateState={updateState}
            />
          }
          modalLayer={<ModalLayer />}
          drawerLayer={
            <>
              <DrawerLayer />
              <SettingsDrawer
                open={settingsDrawerOpen}
                panel={settingsPanel}
                activeProfile={navigation.activeProfile}
                onPanelChange={setSettingsPanel}
                onSelectProfile={navigation.handleSelectProfile}
                onNavigate={navigation.navigateToView}
                onClose={() => setSettingsDrawerOpen(false)}
              />
              <ConfigDiffConfirmDrawer
                open={Boolean(pendingBootstrapDiff?.diff?.length)}
                result={pendingBootstrapDiff}
                onClose={() => setPendingBootstrapDiff(null)}
                onApplied={() => setPendingBootstrapDiff(null)}
              />
            </>
          }
        />
      </NativeShellLayerGateProvider>
    </OverlayProvider>
  );
}

export default Layout;
