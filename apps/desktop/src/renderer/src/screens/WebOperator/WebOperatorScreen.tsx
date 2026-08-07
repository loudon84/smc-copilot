import { useCallback, useState } from "react";
import { WebContentsHost } from "../../components/shell/WebContentsHost";
import type { WebOperatorLayoutState } from "../../../../shared/shell/main-page-state-contract";
import { BrowserToolbar } from "./BrowserToolbar";
import { WebOperatorSideRail } from "./WebOperatorSideRail";
import { WebOperatorTabs } from "./WebOperatorTabs";
import { useWebOperatorLayoutSplit } from "./hooks/useWebOperatorLayoutSplit";
import { HANDLE_PX } from "./web-operator-layout-constants";
import "./web-operator.css";
import { WEB_OPERATOR_LAYER_ID } from "./web-operator-constants";
import { WebOperatorPageContextProvider, useWebOperatorPageContext } from "./context";
import { HostBridgeCommandProvider } from "./host-bridge/HostBridgeCommandContext";
import { WebOperatorPanels } from "./panels";
import { WebOperatorTaskStartDialogHost } from "./WebOperatorTaskStartDialogHost";

export interface WebOperatorScreenProps {
  focusedPanel?: string;
  onFocusedPanelChange?: (panel: string) => void;
  enabled?: boolean;
  layout: WebOperatorLayoutState;
  onLayoutChange: (next: WebOperatorLayoutState) => void;
}

function WebOperatorScreenInner({
  focusedPanel = "",
  enabled = true,
  layout,
  onLayoutChange,
  onFocusedPanelChange,
}: WebOperatorScreenProps): React.JSX.Element {
  const { analysisRequest, taskStartDialog } = useWebOperatorPageContext();
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotRefreshTrigger, setSnapshotRefreshTrigger] = useState(0);
  const [activeLayerId, setActiveLayerId] = useState(WEB_OPERATOR_LAYER_ID);

  const isTaskStartDialogOpen =
    taskStartDialog != null &&
    taskStartDialog.requestId === analysisRequest?.requestId;

  const { layoutRef, sideWidthPx, sideCollapsed, onHandlePointerDown } =
    useWebOperatorLayoutSplit({ layout, onLayoutChange });

  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      onLayoutChange({ ...layout, sideCollapsed: collapsed });
    },
    [layout, onLayoutChange],
  );

  const handleRefreshSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      await window.aiosBrowser.snapshot({
        includeFrames: true,
        includeInteractiveElements: true,
      });
      setSnapshotRefreshTrigger((n) => n + 1);
      if (focusedPanel !== "page-structure") {
        onFocusedPanelChange?.("page-structure");
      }
    } finally {
      setSnapshotLoading(false);
    }
  }, [focusedPanel, onFocusedPanelChange]);

  const gridStyle = {
    "--wo-side-width": `${sideWidthPx}px`,
    "--wo-handle-width": `${HANDLE_PX}px`,
  } as React.CSSProperties;

  return (
    <div
      ref={layoutRef}
      className={`web-operator-layout${sideCollapsed ? " is-side-collapsed" : ""}`}
      style={gridStyle}
    >
      <div className="web-operator-layout__main">
        <BrowserToolbar
          onRefreshSnapshot={() => void handleRefreshSnapshot()}
          snapshotLoading={snapshotLoading}
        />
        <WebOperatorTabs onActiveLayerChange={setActiveLayerId} />
        <WebContentsHost
          layerId={activeLayerId}
          className="web-operator-layout__viewport"
          enabled={enabled && !isTaskStartDialogOpen}
        />
      </div>

      {!sideCollapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize side panel"
          className="web-operator-layout__handle"
          onPointerDown={onHandlePointerDown}
        />
      ) : null}

      {!sideCollapsed ? (
        <section className="web-operator-layout__side">
          <WebOperatorPanels
            focusedPanel={focusedPanel}
            externalRefreshTrigger={snapshotRefreshTrigger}
            onRefreshSnapshot={() => void handleRefreshSnapshot()}
            onFocusedPanelChange={onFocusedPanelChange}
          />
        </section>
      ) : null}

      <WebOperatorSideRail
        focusedPanel={focusedPanel}
        onFocusedPanelChange={onFocusedPanelChange}
        panelsOpen={!sideCollapsed}
        onTogglePanelsOpen={() => setCollapsed(!sideCollapsed)}
      />
    </div>
  );
}

export function WebOperatorScreen(props: WebOperatorScreenProps): React.JSX.Element {
  return (
    <WebOperatorPageContextProvider>
      <HostBridgeCommandProvider>
        <WebOperatorScreenInner {...props} />
        <WebOperatorTaskStartDialogHost />
      </HostBridgeCommandProvider>
    </WebOperatorPageContextProvider>
  );
}
