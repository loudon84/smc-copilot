type Props = {
  mode: "default" | "expert" | "team";
  label: string;
  skillName?: string;
  skillDisplayName?: string;
  workMode: "ask" | "plan" | "craft";
  showReturnDefault?: boolean;
  onReturnDefault?: () => void;
  onWorkModeChange?: (mode: "ask" | "plan" | "craft") => void;
};

/**
 * Compact Chat TopBar row ≤36px — Expert/Team/Default · Skill + Ask/Plan/Craft.
 * No run status, tokens, diagnostics, or folder (PRD v1.6.1 §35/§63).
 */
export function ChatRunHeader({
  mode,
  label,
  skillName,
  skillDisplayName,
  workMode,
  showReturnDefault,
  onReturnDefault,
  onWorkModeChange,
}: Props): React.JSX.Element {
  const skillLabel = skillDisplayName || skillName;
  const title =
    mode === "default"
      ? label || "Hermes"
      : skillLabel
        ? `${label} · ${skillLabel}`
        : label;

  return (
    <div className="chat-run-header chat-top-bar-compact" data-testid="chat-run-header">
      <div className="chat-run-header-left">
        <strong className="chat-run-header-label" title={title}>
          {title}
        </strong>
        {showReturnDefault && onReturnDefault ? (
          <button
            type="button"
            className="chat-run-header-return"
            onClick={onReturnDefault}
            title="Return to Default"
          >
            ×
          </button>
        ) : null}
      </div>
      <div
        className="chat-run-header-modes"
        role="group"
        aria-label="Work mode"
        data-testid="chat-work-mode-group"
      >
        {(["ask", "plan", "craft"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={workMode === m ? "is-active" : undefined}
            onClick={() => onWorkModeChange?.(m)}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
