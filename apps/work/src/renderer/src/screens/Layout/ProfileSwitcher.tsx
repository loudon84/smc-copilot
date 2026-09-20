import { useState, useEffect, useCallback } from "react";
import { LogOut } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import ProfileAvatar from "../../components/common/ProfileAvatar";
import { useProfileModal } from "../../components/profile/ProfileModalContext";
import { AppModal, AppModalTitle } from "../../components/modal/AppModal";
import type { DesktopAuthState } from "../../../../shared/auth/auth-contract";
import { skipPortalLogin } from "../../../../shared/auth/auth-url";

interface ProfileInfo {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  model: string;
  skillCount: number;
  gatewayRunning: boolean;
  color?: string;
  avatar?: string | null;
}

interface ProfileSwitcherProps {
  /** Id of the currently active profile ("default" for the base workspace). */
  activeProfile: string;
  /** Render as an icon-only sidebar footer affordance. */
  compact?: boolean;
}

const EMPTY_AUTH: DesktopAuthState = {
  authenticated: false,
  endpointConfig: null,
  user: null,
  expiresAt: null,
};

/**
 * Sidebar-footer account chip: agent avatar + portal user label. Clicking the
 * chip opens the current agent's Profile modal. Expanded layout also offers
 * Sign out (hidden when portal login is skipped, when compact, or when the
 * session is already unsigned).
 */
export default function ProfileSwitcher({
  activeProfile,
  compact = false,
}: ProfileSwitcherProps): React.JSX.Element {
  const { t } = useI18n();
  const { openProfile } = useProfileModal();
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [authState, setAuthState] = useState<DesktopAuthState>(EMPTY_AUTH);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const load = useCallback(() => {
    window.hermesAPI
      .listProfiles()
      .then(setProfiles)
      .catch(() => {
        /* keep last-known list */
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const api = window.desktopAuth;
    if (!api) return;

    let cancelled = false;
    const apply = (state: DesktopAuthState): void => {
      if (cancelled) return;
      setAuthState({
        authenticated: state.authenticated,
        endpointConfig: state.endpointConfig,
        user: state.user,
        expiresAt: state.expiresAt,
      });
    };

    void api.getState().then(apply);
    const unsubscribe = api.onStateChanged(apply);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const activeInfo = profiles.find((p) => p.id === activeProfile);
  const portalLabel = authState.authenticated
    ? authState.user?.displayName?.trim() ||
      authState.user?.username?.trim() ||
      null
    : null;
  const chipLabel = portalLabel || t("auth.notSignedIn");
  const showLogout =
    !compact && !skipPortalLogin() && authState.authenticated;

  function editCurrent(): void {
    openProfile(activeProfile, { onChanged: load });
  }

  async function handleConfirmLogout(): Promise<void> {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await window.desktopAuth.logout();
      setConfirmLogout(false);
    } catch {
      setConfirmLogout(false);
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <>
      <div className={`profile-switcher ${compact ? "compact" : ""}`}>
        <button
          className="profile-switcher-trigger"
          onClick={editCurrent}
          title={t("agents.editAppearanceFor", { name: chipLabel })}
        >
          <ProfileAvatar
            name={activeProfile}
            color={activeInfo?.color}
            avatar={activeInfo?.avatar}
            size={compact ? 22 : 18}
          />
          {!compact && (
            <span className="profile-switcher-name">{chipLabel}</span>
          )}
        </button>
        {showLogout && (
          <button
            className="profile-switch-btn"
            onClick={() => setConfirmLogout(true)}
            title={t("auth.logout")}
            aria-label={t("auth.logout")}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>

      <AppModal
        open={confirmLogout}
        onOpenChange={(open) => {
          if (logoutBusy && !open) return;
          setConfirmLogout(open);
        }}
        className="profile-logout-modal"
        overlayClassName="profile-logout-overlay"
        contentClassName="profile-logout-viewport"
        labelledBy="profile-logout-title"
        describedBy="profile-logout-body"
        submitting={logoutBusy}
      >
        <AppModalTitle id="profile-logout-title" className="profile-logout-title">
          {t("auth.logoutConfirmTitle")}
        </AppModalTitle>
        <p id="profile-logout-body" className="profile-logout-body">
          {portalLabel
            ? t("auth.logoutConfirm", { name: portalLabel })
            : t("auth.logoutConfirmAnonymous")}
        </p>
        <div className="profile-logout-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={logoutBusy}
            onClick={() => setConfirmLogout(false)}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={logoutBusy}
            onClick={() => {
              void handleConfirmLogout();
            }}
          >
            {t("auth.logout")}
          </button>
        </div>
      </AppModal>
    </>
  );
}
