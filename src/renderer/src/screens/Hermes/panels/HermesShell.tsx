import { Suspense, useEffect, useMemo } from "react";
import { LAYOUT } from "../constants";
import { HermesSidebar } from "../components/HermesSidebar";
import { HermesPageErrorBoundary } from "../components/HermesPageErrorBoundary";
import { HermesPageSkeleton } from "../components/HermesPageSkeleton";
import { useHermesDefault } from "../context/HermesDefaultContext";
import { useGatewayNavGate } from "../features/nav/useGatewayNavGate";
import { HermesPersistentChatWorkspace } from "../pages/Chat/HermesPersistentChatWorkspace";
import { HERMES_PAGE_REGISTRY, type HermesPageKey } from "../registry/hermes-pages";
import { HermesRightPanel } from "./HermesRightPanel";
import { HermesRightPanelRail } from "./HermesRightPanelRail";
import type { HermesNavItemKey } from "../constants";

type Props = {
  activePanel?: string;
  onPanelChange?: (panel: string) => void;
  onOpenRuntimeSettings?: () => void;
};

function HermesPageLoader({ pageKey }: { pageKey: HermesPageKey }) {
  const Page = HERMES_PAGE_REGISTRY[pageKey];
  return (
    <HermesPageErrorBoundary>
      <Suspense fallback={<HermesPageSkeleton />}>
        <Page />
      </Suspense>
    </HermesPageErrorBoundary>
  );
}

// @lat: [[domain/chat#Persistent mount and session catalog]]
export function HermesShell({
  activePanel,
  onPanelChange,
  onOpenRuntimeSettings,
}: Props) {
  const {
    activeNavItem,
    setActiveNavItem,
    leftPanelCollapsed,
    rightPanelCollapsed,
    navItems,
  } = useHermesDefault();
  const { gatewayOnline, loading: gatewayLoading } = useGatewayNavGate();

  const pageKey = ((activePanel as HermesNavItemKey | undefined) ?? activeNavItem) as HermesPageKey;
  const chatVisible = pageKey === "chat";

  const activeNavDefinition = useMemo(
    () => navItems.find((item) => item.key === pageKey),
    [navItems, pageKey],
  );

  useEffect(() => {
    if (activePanel && activePanel !== activeNavItem) {
      setActiveNavItem(activePanel as HermesNavItemKey);
    }
  }, [activePanel, activeNavItem, setActiveNavItem]);

  useEffect(() => {
    if (gatewayLoading) return;
    if (activeNavDefinition?.requiresGateway && !gatewayOnline) {
      setActiveNavItem("workbench");
      onPanelChange?.("workbench");
    }
  }, [
    gatewayLoading,
    gatewayOnline,
    activeNavDefinition,
    setActiveNavItem,
    onPanelChange,
  ]);

  const leftCol = leftPanelCollapsed
    ? `${LAYOUT.sidebarCollapsedWidthPx}px`
    : `${LAYOUT.sidebarWidthPx}px`;
  const rightCol = rightPanelCollapsed
    ? `${LAYOUT.rightPanelCollapsedWidthPx}px`
    : `${LAYOUT.rightPanelWidthPx}px`;

  return (
    <div className="hermes-screen">
      <div className="hermes-shell">
        <div
          className="hermes-body"
          style={
            {
              "--hermes-left-width": leftCol,
              "--hermes-right-width": rightCol,
            } as React.CSSProperties
          }
        >
          <HermesSidebar activePanel={activePanel} onPanelChange={onPanelChange} />

          <main className="hermes-center">
            <div className="hermes-center-scroll hermes-center-scroll--relative">
              <HermesPersistentChatWorkspace visible={chatVisible} />
              {!chatVisible ? <HermesPageLoader pageKey={pageKey} /> : null}
            </div>
          </main>

          {rightPanelCollapsed ? (
            <HermesRightPanelRail onOpenRuntimeSettings={onOpenRuntimeSettings} />
          ) : (
            <HermesRightPanel onOpenRuntimeSettings={onOpenRuntimeSettings} />
          )}
        </div>
      </div>
    </div>
  );
}
