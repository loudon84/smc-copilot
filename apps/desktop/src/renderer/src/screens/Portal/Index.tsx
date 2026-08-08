import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RuntimeStatusBar } from "../../components/runtime/RuntimeStatusBar";
import { WebContentsHost } from "../../components/shell/WebContentsHost";
import type { View } from "../../types/desktop-shell";
import type { RuntimeServiceRecord } from "../../../../shared/aios/aios-contract";

export interface PortalScreenProps {
  onNavigate: (view: View) => void;
  onOpenRuntimeSettings?: () => void;
  enabled?: boolean;
}

const PORTAL_LAYER = "portal";

export function PortalScreen({
  onOpenRuntimeSettings,
  enabled = true,
}: PortalScreenProps): React.JSX.Element {
  const { t } = useTranslation("portal");
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<RuntimeServiceRecord[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [homeUrl, setHomeUrl] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const snapshot = await window.aiosRuntime.getRuntimeSnapshot();
      setServices(snapshot.services);
      setStatusError(null);
    } catch (err) {
      console.warn("[Portal] Failed to refresh Portal runtime snapshot:", err);
      setStatusError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void window.aiosRuntime
      .getHomeUrl()
      .then(({ url }) => setHomeUrl(url))
      .catch(() => {
        setHomeUrl(null);
      });
  }, []);

  // Ensure Main Process WebContentsView exists (getState alone did not create it).
  useEffect(() => {
    if (!enabled) return;
    void window.shellView.getState(PORTAL_LAYER).catch((err) => {
      console.warn("[Portal] Failed to ensure portal shell view:", err);
    });
  }, [enabled]);

  useEffect(() => {
    void refreshStatus();
    const interval = setInterval(() => {
      void refreshStatus();
    }, 10_000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  useEffect(() => {
    try {
      const unsub = window.aiosRuntime.onAiOsRuntimeChanged(() => {
        void refreshStatus();
        void window.aiosRuntime
          .getHomeUrl()
          .then(({ url }) => setHomeUrl(url))
          .catch(() => undefined);
      });
      return unsub;
    } catch {
      return undefined;
    }
  }, [refreshStatus]);

  /**
   * `aios-frontend` in snapshot = HTTP health of login-configured portal URL (aiosHomeUrl),
   * NOT "Desktop must have spawned the Next.js child process".
   * External `pnpm dev` on :3000 counts as running when the URL responds.
   */
  const portalRecord = services.find((s) => s.service_id === "aios-frontend");

  const portalUnreachable =
    Boolean(homeUrl) &&
    !loading &&
    statusError === null &&
    services.length > 0 &&
    portalRecord?.status !== "running";

  if (!homeUrl && !loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center">
        <p className="text-sm text-zinc-300">{t("portalEndpointNotConfigured")}</p>
        {onOpenRuntimeSettings ? (
          <button
            type="button"
            className="rounded border border-zinc-600 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => onOpenRuntimeSettings()}
          >
            {t("openRuntimeSettings")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {portalUnreachable ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber-800/40 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-100/90">
          <RuntimeStatusBar
            services={services}
            loading={loading}
            className="shrink-0"
          />
          <span className="min-w-0 flex-1">
            {t("portalUnreachable", { url: homeUrl })}
          </span>
          {onOpenRuntimeSettings ? (
            <button
              type="button"
              className="shrink-0 rounded border border-amber-700/50 px-2 py-0.5 text-[11px] hover:bg-amber-900/40"
              onClick={() => onOpenRuntimeSettings()}
            >
              {t("openRuntimeSettings")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <WebContentsHost layerId={PORTAL_LAYER} enabled={enabled} />
      </div>
    </div>
  );
}
