import { X } from "lucide-react";
import { useState } from "react";
import type {
  BootstrapResult,
  ConfigDiffItem,
} from "../../../../shared/user-config/user-config-contract";
import { useI18n } from "../../components/useI18n";
import "./styles/login.css";

export interface ConfigDiffConfirmDrawerProps {
  open: boolean;
  result: BootstrapResult | null;
  onClose: () => void;
  onApplied?: () => void;
  /** When true, backdrop click does not dismiss (login gate must apply before continue). */
  preventBackdropDismiss?: boolean;
  /** Login gate: centered card using login.css tokens instead of tailwind drawer. */
  variant?: "drawer" | "login";
}

export function ConfigDiffConfirmDrawer({
  open,
  result,
  onClose,
  onApplied,
  preventBackdropDismiss = false,
  variant = "drawer",
}: ConfigDiffConfirmDrawerProps): React.JSX.Element | null {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !result?.diff?.length) return null;

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await window.desktopUserConfig.applyRemoteConfig(result.confirmToken);
      onApplied?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const backdropClass =
    variant === "login" ? "login-config-diff-backdrop" : "fixed inset-0 z-[60] bg-black/50";

  const backdrop = preventBackdropDismiss ? (
    <div className={backdropClass} aria-hidden />
  ) : (
    <button
      type="button"
      className={backdropClass}
      aria-label={t("auth.configDiffCancel")}
      onClick={onClose}
    />
  );

  if (variant === "login") {
    return (
      <>
        {backdrop}
        <div className="login-config-diff-modal" role="dialog" aria-modal="true">
          <header className="login-config-diff-header">
            <h2>{t("auth.configDiff")}</h2>
            <button
              type="button"
              className="login-config-diff-close"
              onClick={onClose}
              aria-label={t("auth.configDiffCancel")}
            >
              <X size={18} />
            </button>
          </header>
          <ul className="login-config-diff-list">
            {result.diff.map((item: ConfigDiffItem) => (
              <li key={item.path} className="login-config-diff-item">
                <span className="login-config-diff-type">{item.type}</span> {item.path}
                {item.type === "changed" ? (
                  <p className="login-config-diff-change">
                    {String(item.localValue)} → {String(item.remoteValue)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {error ? <p className="login-config-diff-error">{error}</p> : null}
          <footer className="login-config-diff-footer">
            <button type="button" className="login-config-diff-cancel" onClick={onClose}>
              {t("auth.configDiffCancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              className="login-submit-btn login-config-diff-apply"
              onClick={() => void apply()}
            >
              {busy ? t("auth.bootstrap") : t("auth.configDiffApply")}
            </button>
          </footer>
        </div>
      </>
    );
  }

  return (
    <>
      {backdrop}
      <aside className="fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{t("auth.configDiff")}</h2>
          <button type="button" className="text-zinc-400" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto p-4 space-y-2 text-xs font-mono">
          {result.diff.map((item: ConfigDiffItem) => (
            <li key={item.path} className="rounded border border-zinc-800 p-2">
              <span className="text-emerald-400">{item.type}</span> {item.path}
              {item.type === "changed" ? (
                <p className="mt-1 text-zinc-500">
                  {String(item.localValue)} → {String(item.remoteValue)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {error ? <p className="px-4 text-xs text-red-400">{error}</p> : null}
        <footer className="flex gap-2 border-t border-zinc-800 p-4">
          <button
            type="button"
            className="flex-1 rounded bg-zinc-800 py-2 text-xs text-zinc-200"
            onClick={onClose}
          >
            {t("auth.configDiffCancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded bg-emerald-700 py-2 text-xs text-white disabled:opacity-50"
            onClick={() => void apply()}
          >
            {busy ? t("auth.bootstrap") : t("auth.configDiffApply")}
          </button>
        </footer>
      </aside>
    </>
  );
}
