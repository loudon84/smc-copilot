import React, { Suspense, useState } from "react";
import { LAYOUT, type NavItemKey } from "../constants";
import { WorkspaceStatusCards } from "../components/WorkspaceStatusCards";
import { WorkspacesSidebar } from "../components/WorkspacesSidebar";
import { WorkspaceRightPanel } from "../components/WorkspaceRightPanel";
import { WorkspaceRightPanelRail } from "../components/WorkspaceRightPanelRail";
import { WorkspacesProvider, useWorkspaces } from "../context/WorkspacesContext";
import { useActiveProfile } from "../hooks/useActiveProfile";
import { WORKSPACE_PAGE_REGISTRY } from "../registry/workspace-pages";

function PageSkeleton(): React.JSX.Element {
  return (
    <div className="workspaces-page-loading">
      <div className="workspaces-page-loading-spinner" aria-hidden />
    </div>
  );
}

function PageErrorFallback({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className="workspaces-page-error">
      <p className="workspaces-page-error-message">
        {error instanceof Error ? error.message : "Failed to load page"}
      </p>
      <button type="button" onClick={onRetry} className="workspaces-action-button">
        Retry
      </button>
    </div>
  );
}

function PageLoader({ pageKey }: { pageKey: NavItemKey }): React.JSX.Element {
  const [retryKey, setRetryKey] = useState(0);
  const PageComponent = WORKSPACE_PAGE_REGISTRY[pageKey];

  return (
    <PageErrorBoundary
      key={`${pageKey}-${retryKey}`}
      fallback={(error) => (
        <PageErrorFallback error={error} onRetry={() => setRetryKey((k) => k + 1)} />
      )}
    >
      <Suspense fallback={<PageSkeleton />}>
        <PageComponent />
      </Suspense>
    </PageErrorBoundary>
  );
}

class PageErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: (error: unknown) => React.ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }
    return this.props.children;
  }
}

export interface WorkspacesShellProps {
  profile?: string;
  initialNavItem?: string;
  onNavItemChange?: (key: NavItemKey) => void;
  onOpenSettings?: () => void;
}

function WorkspacesShellInner({ onOpenSettings }: { onOpenSettings?: () => void }): React.JSX.Element {
  const { activeNavItem, leftPanelCollapsed, rightPanelCollapsed } = useWorkspaces();
  const { loading, error } = useActiveProfile();

  const leftCol = leftPanelCollapsed
    ? `${LAYOUT.sidebarCollapsedWidthPx}px`
    : `${LAYOUT.sidebarWidthPx}px`;
  const rightCol = rightPanelCollapsed
    ? `${LAYOUT.rightPanelCollapsedWidthPx}px`
    : `${LAYOUT.rightPanelWidthPx}px`;

  return (
    <div className="workspaces-shell">
      <WorkspaceStatusCards onOpenSettings={onOpenSettings} />
      {loading ? (
        <p className="workspaces-runtime-message">Loading profiles…</p>
      ) : null}
      {error ? <p className="workspaces-runtime-message is-error">{error}</p> : null}

      <div
        className="workspaces-body"
        style={
          {
            "--ws-left-width": leftCol,
            "--ws-right-width": rightCol,
          } as React.CSSProperties
        }
      >
        <WorkspacesSidebar activeKey={activeNavItem} collapsed={leftPanelCollapsed} />

        <main className="workspaces-center">
          <div className="workspaces-center-scroll">
            <PageLoader pageKey={activeNavItem} />
          </div>
        </main>

        {rightPanelCollapsed ? <WorkspaceRightPanelRail /> : <WorkspaceRightPanel />}
      </div>
    </div>
  );
}

export function WorkspacesShell({
  profile,
  initialNavItem,
  onNavItemChange,
  onOpenSettings,
}: WorkspacesShellProps): React.JSX.Element {
  return (
    <WorkspacesProvider
      initialProfileId={profile}
      initialNavItem={initialNavItem}
      onNavItemChange={onNavItemChange}
    >
      <WorkspacesShellInner onOpenSettings={onOpenSettings} />
    </WorkspacesProvider>
  );
}
