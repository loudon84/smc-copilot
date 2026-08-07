import { ChevronDown } from "lucide-react";
import type { AIOSProfile } from "../../types";

export function ProfileSelector({
  profiles,
  activeProfileId,
  onSelect,
}: {
  profiles: AIOSProfile[];
  activeProfileId: string | null;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const active = profiles.find((p) => p.id === activeProfileId);
  return (
    <label className="workspaces-webchat-profile-select">
      <span className="workspaces-webchat-toolbar-label">Profile</span>
      <div className="workspaces-webchat-select-wrap">
        <select
          value={activeProfileId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="workspaces-webchat-select"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName || p.name}
            </option>
          ))}
        </select>
        <ChevronDown size={12} className="workspaces-webchat-select-icon" />
      </div>
      {active ? (
        <span className="workspaces-webchat-profile-meta">{active.status}</span>
      ) : null}
    </label>
  );
}
