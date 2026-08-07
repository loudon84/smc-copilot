import type { UpdateState } from "../../types/desktop-shell";

export interface StatusBarProps {
  activeProfile: string;
  remoteMode: boolean;
  updateState: UpdateState;
}

export function StatusBar({
  activeProfile,
  remoteMode,
  updateState,
}: StatusBarProps): React.JSX.Element {
  const modeLabel = remoteMode ? "remote" : "local";

  return (
    <footer className="status-bar" role="status">
      <span className="status-bar__item">Profile: {activeProfile}</span>
      <span className="status-bar__item">Mode: {modeLabel}</span>
      <span className="status-bar__item">
        Update: {updateState ?? "idle"}
      </span>
    </footer>
  );
}
