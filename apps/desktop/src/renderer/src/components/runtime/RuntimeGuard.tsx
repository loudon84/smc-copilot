import { useState, useCallback } from "react";
import { Signal, Play, Settings as SettingsIcon } from "../../assets/icons";
import { Spinner } from "../../assets/icons";
import { useI18n } from "../useI18n";

export interface RuntimeGuardProps {
  gatewayStatus: string;
  /** Opens unified Settings Drawer → Runtime panel (not a separate Hermes UI). */
  onOpenRuntimeSettings?: () => void;
  onStarted?: () => void | Promise<void>;
}

export function RuntimeGuard({
  gatewayStatus,
  onOpenRuntimeSettings,
  onStarted,
}: RuntimeGuardProps): React.JSX.Element {
  const { t } = useI18n();
  const [starting, setStarting] = useState(false);

  const handleStartRuntime = useCallback(async () => {
    setStarting(true);
    try {
      await window.hermesAPI.startGateway();
      await window.aiosRuntime?.startAiOs?.();
      await onStarted?.();
    } catch (err) {
      console.error("[RuntimeGuard] Failed to start Portal runtime:", err);
    } finally {
      setStarting(false);
    }
  }, [onStarted]);

  return (
    <MotionSafeRuntimeGuard>
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <Signal size={28} className="text-zinc-400" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-100">{t("runtimeGuard.title")}</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">{t("runtimeGuard.description")}</p>
      </div>
      {gatewayStatus === "error" ? (
        <div className="px-4 py-3 rounded-lg bg-red-900/20 border border-red-800/40 text-xs text-red-300">
          {t("runtimeGuard.gatewayError")}
        </div>
      ) : null}
      <div className="space-y-2">
        <button
          type="button"
          disabled={starting}
          onClick={() => void handleStartRuntime()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
        >
          {starting ? <Spinner size={14} className="animate-spin" /> : <Play size={14} />}
          {t("runtimeGuard.startGateway")}
        </button>
        <button
          type="button"
          onClick={() => onOpenRuntimeSettings?.()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition-colors"
        >
          <SettingsIcon size={14} />
          {t("navigation.openSettings", { defaultValue: "Open settings" })}
        </button>
      </div>
    </MotionSafeRuntimeGuard>
  );
}

function MotionSafeRuntimeGuard({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-8">
      <div className="max-w-md w-full text-center space-y-6">{children}</div>
    </div>
  );
}
