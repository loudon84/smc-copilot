type Props = {
  expertName?: string;
  teamName?: string;
  workMode?: string;
  onReturnDefault?: () => void;
  onWorkModeChange?: (mode: "ask" | "plan" | "craft") => void;
};

/**
 * @deprecated v8.0.3 — use ChatRunHeader instead. Kept for legacy references.
 */
export function ChatHeader({
  expertName,
  teamName,
  workMode = "ask",
  onReturnDefault,
  onWorkModeChange,
}: Props): React.JSX.Element {
  const label = teamName || expertName || "Default";
  return (
    <div className="chat-header-bar">
      <div className="chat-header-active">
        <span className="chat-header-label">{teamName ? "Team" : "Expert"}</span>
        <strong>{label}</strong>
        {(expertName || teamName) && onReturnDefault && (
          <button type="button" onClick={onReturnDefault}>
            Return Default
          </button>
        )}
      </div>
      <div className="chat-header-modes" role="group" aria-label="Work mode">
        {(["ask", "plan", "craft"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={workMode === mode ? "is-active" : ""}
            onClick={() => onWorkModeChange?.(mode)}
          >
            {mode[0].toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
