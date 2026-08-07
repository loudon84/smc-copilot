import { useState } from "react";
import type { ProfileSummary } from "../../../../../shared/profile-runtime/profile-runtime-contract";
import type { ProfileRoleSpecSummary } from "../../../../../shared/profile-roles/profile-role-contract";
import { useI18n } from "../../../components/useI18n";

export interface ProfileRoleSourceViewProps {
  profile: ProfileSummary | null;
  roleSpec: ProfileRoleSpecSummary | null;
  onUpdated: () => void;
}

export function ProfileRoleSourceView({
  profile,
  roleSpec,
  onUpdated,
}: ProfileRoleSourceViewProps): React.JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleRecompile = async (): Promise<void> => {
    if (!profile) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.profileRole.recompile(profile.id);
      setMessage(
        result.ok
          ? t("runtimeSettings.multiProfilesRecompileOk", { checksum: result.checksum ?? "" })
          : (result.error ?? t("runtimeSettings.multiProfilesRecompileFailed")),
      );
      if (result.ok) onUpdated();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-drawer-section">
      <h3 className="settings-drawer-section-title">
        {t("runtimeSettings.multiProfilesRoleTitle")}
      </h3>
      {!profile ? (
        <p className="settings-drawer-text-muted">{t("runtimeSettings.multiProfilesSelectProfile")}</p>
      ) : !roleSpec ? (
        <p className="settings-drawer-text-muted">{t("runtimeSettings.multiProfilesNoRoleSpec")}</p>
      ) : (
        <dl className="settings-drawer-dl">
          <div className="settings-drawer-dl-row">
            <dt>{t("runtimeSettings.multiProfilesRoleName")}</dt>
            <dd>{roleSpec.roleName}</dd>
          </div>
          <div className="settings-drawer-dl-row">
            <dt>{t("runtimeSettings.multiProfilesRoleKey")}</dt>
            <dd>{roleSpec.roleKey}</dd>
          </div>
          <div className="settings-drawer-dl-block">
            <dt>{t("runtimeSettings.multiProfilesSourceRepo")}</dt>
            <dd>{roleSpec.roleSourceRepo}</dd>
          </div>
          <div className="settings-drawer-dl-block">
            <dt>{t("runtimeSettings.multiProfilesSourcePaths")}</dt>
            <dd>
              <ul>
                {roleSpec.sourcePaths.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="settings-drawer-dl-row">
            <dt>{t("runtimeSettings.multiProfilesChecksum")}</dt>
            <dd className="settings-drawer-dl-truncate" title={roleSpec.sourceChecksum}>
              {roleSpec.sourceChecksum}
            </dd>
          </div>
        </dl>
      )}
      <button
        type="button"
        className="settings-drawer-btn-ghost"
        disabled={busy || !profile || !roleSpec}
        onClick={() => void handleRecompile()}
      >
        {busy
          ? t("runtimeSettings.multiProfilesRecompiling")
          : t("runtimeSettings.multiProfilesRecompile")}
      </button>
      {message ? <p className="settings-drawer-text-muted">{message}</p> : null}
    </section>
  );
}
