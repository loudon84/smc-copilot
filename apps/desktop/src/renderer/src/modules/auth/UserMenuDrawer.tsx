import { X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useI18n } from "../../components/useI18n";

export interface UserMenuDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function UserMenuDrawer({ open, onClose }: UserMenuDrawerProps): React.JSX.Element | null {
  const { t } = useI18n();
  const { authState, logout } = useAuth();
  const user = authState?.user;

  if (!open) return null;

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/50"
        aria-label={t("auth.configDiffCancel")}
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-72 flex-col border-l border-zinc-800 bg-zinc-950 shadow-xl">
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{t("auth.account")}</h2>
          <button type="button" className="text-zinc-400 hover:text-zinc-100" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 p-4 text-sm text-zinc-300">
          {user ? (
            <>
              <p className="font-medium text-zinc-100">{user.displayName ?? user.username}</p>
              <p className="text-xs text-zinc-500">{user.username}</p>
              {user.tenantId ? (
                <p className="mt-2 text-xs text-zinc-500">{user.tenantId}</p>
              ) : null}
            </>
          ) : null}
        </div>
        <footer className="border-t border-zinc-800 p-4">
          <button
            type="button"
            className="w-full rounded bg-zinc-800 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
            onClick={() => void handleLogout()}
          >
            {t("auth.logout")}
          </button>
        </footer>
      </aside>
    </>
  );
}
