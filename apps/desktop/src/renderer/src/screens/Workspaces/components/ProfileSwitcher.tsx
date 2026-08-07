import { ProfileStatusBadge } from "./ProfileStatusBadge";
import { useWorkspaces } from "../context/WorkspacesContext";

export function ProfileSwitcher(): React.JSX.Element {
  const { profiles, activeProfileId, setActiveProfileId } = useWorkspaces();

  return (
    <div className="workspaces-profile-switcher">
      {profiles.map((p) => {
        const active = p.id === activeProfileId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveProfileId(p.id)}
            className={`workspaces-profile-switcher-btn ${active ? "is-active" : ""}`}
          >
            <div className="workspaces-profile-switcher-row">
              <span className="workspaces-profile-switcher-name">{p.displayName}</span>
              <ProfileStatusBadge status={p.status} />
            </div>
            {p.description ? (
              <p className="workspaces-profile-switcher-desc">{p.description}</p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
