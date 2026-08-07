import { useAuth } from "../../modules/auth/AuthProvider";
import { useI18n } from "../../components/useI18n";

export interface AuthPanelProps {
  onClose?: () => void;
}

export function AuthPanel({ onClose }: AuthPanelProps): React.JSX.Element {
  const { t } = useI18n();
  const { authState, logout } = useAuth();
  const user = authState?.user;

  const handleLogout = async (): Promise<void> => {
    await logout();
    onClose?.();
  };

  return (
    <div className="settings-drawer-padded settings-drawer-stack-sm">
      {user ? (
        <>
          <p className="settings-drawer-text-strong">{user.displayName ?? user.username}</p>
          <p className="settings-drawer-text-muted">{user.username}</p>
          {user.tenantId ? (
            <p className="settings-drawer-text-muted">{user.tenantId}</p>
          ) : null}
        </>
      ) : (
        <p className="settings-drawer-text-muted">{t("auth.notSignedIn")}</p>
      )}
      <button
        type="button"
        className="settings-drawer-btn-secondary settings-drawer-btn-block"
        disabled={!user}
        onClick={() => void handleLogout()}
      >
        {t("auth.logout")}
      </button>
    </div>
  );
}
