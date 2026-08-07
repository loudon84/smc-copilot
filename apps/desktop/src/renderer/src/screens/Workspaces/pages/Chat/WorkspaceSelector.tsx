import { ChevronDown } from "lucide-react";
import type { WorkspaceOption } from "./hooks/useWorkspaceOptions";

export function WorkspaceSelector({
  options,
  workspaceId,
  onSelect,
  disabled,
}: {
  options: WorkspaceOption[];
  workspaceId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <label className="workspaces-webchat-workspace-select">
      <span className="workspaces-webchat-toolbar-label">Workspace</span>
      <div className="workspaces-webchat-select-wrap">
        <select
          value={workspaceId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="workspaces-webchat-select"
          disabled={disabled || options.length === 0}
        >
          {options.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        <ChevronDown size={12} className="workspaces-webchat-select-icon" />
      </div>
    </label>
  );
}
