import { useCallback, useEffect, useState } from "react";
import type { RuntimeReadinessView } from "../../../../shared/copilot-runtime";
import { useCopilotRuntime } from "../../hooks/useCopilotRuntime";

type DomainBanner = {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
};

/**
 * PRD v1.4 §46 — domain banners instead of a single RuntimeDegraded block.
 * Connection offline still shows a connection banner; hermes/MCP/update are separate.
 */
export function RuntimeDegradedBanner({
  onOpenRuntimeSettings,
}: {
  onOpenRuntimeSettings?: () => void;
}): React.JSX.Element | null {
  const { state, busy, retry, repair } = useCopilotRuntime();
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [readiness, setReadiness] = useState<RuntimeReadinessView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      if (!window.copilotRuntime?.getReadiness) return;
      try {
        const value = await window.copilotRuntime.getReadiness();
        if (!cancelled) setReadiness(value);
      } catch {
        if (!cancelled) setReadiness(null);
      }
    };
    void load();
    if (!window.copilotRuntime) return;
    return window.copilotRuntime.onStateChanged(() => {
      void load();
    });
  }, []);

  const handleRetry = useCallback(() => {
    void retry();
  }, [retry]);

  const handleRepair = useCallback(() => {
    void repair();
  }, [repair]);

  const banners: DomainBanner[] = [];

  if (!state.ready && state.state !== "Connecting") {
    banners.push({
      id: "connection",
      title: state.state === "RuntimeMissing" ? "Runtime Offline" : `Runtime is ${state.state}`,
      body: "Desktop connects to Runtime at :8765. Install/Start Runtime is not a Desktop action.",
      actionLabel: "Retry",
    });
  } else if (readiness && !readiness.execution.ready) {
    banners.push({
      id: "execution",
      title: "Agent execution unavailable",
      body: "No healthy Hermes Instance is currently available. Chat / Task writes are gated until execution is ready.",
      actionLabel: "View Instances",
    });
  }

  if (readiness && !readiness.expertMcp.ready && readiness.expertMcp.status !== "not_configured") {
    banners.push({
      id: "expertMcp",
      title: "Expert tools unavailable",
      body: "Expert MCP Gateway is offline or unauthorized.",
      actionLabel: "View Expert MCP",
    });
  }

  if (readiness && !readiness.maintenance.ready) {
    banners.push({
      id: "maintenance",
      title: "Update service unavailable",
      body: "Hermes update manifest is missing or not configured. Chat/Task are not blocked by this.",
      actionLabel: "View Runtime",
    });
  }

  const visible = banners.filter((b) => !dismissed[b.id]);
  if (visible.length === 0) return null;

  return (
    <div data-testid="runtime-degraded-banner">
      {visible.map((banner) => (
        <div
          key={banner.id}
          className="runtime-degraded-banner"
          role="status"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-color, #3f3f46)",
            background: "rgba(234, 179, 8, 0.12)",
            color: "var(--text-primary, #fafafa)",
            fontSize: 13,
          }}
        >
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <strong>{banner.title}</strong>
            <div style={{ opacity: 0.85, marginTop: 2 }}>
              {banner.body}
              {banner.id === "connection" && state.lastError ? ` ${state.lastError}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {banner.id === "connection" ? (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={handleRetry}>
                Retry
              </button>
            ) : null}
            {banner.id === "connection" && state.canRepair ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={handleRepair}
                data-testid="runtime-degraded-repair"
              >
                Repair Runtime
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onOpenRuntimeSettings?.()}
              data-testid="runtime-degraded-open-settings"
            >
              {banner.actionLabel}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDismissed((prev) => ({ ...prev, [banner.id]: true }))}
              aria-label="Dismiss banner"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
