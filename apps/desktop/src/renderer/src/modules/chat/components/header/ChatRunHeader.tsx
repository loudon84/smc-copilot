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
 * Unified Chat Run header — single Expert/Team/Default row + Ask/Plan/Craft.
 * Replaces ChatHeader + HermesActiveExpertBar combo.
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
  const kindLabel =
    mode === "team" ? "Team" : mode === "expert" ? "Expert" : "Default";
  const skillLabel = skillDisplayName || skillName;

  return (
    <div className="chat-run-header" data-testid="chat-run-header">
      <div className="chat-run-header-left">
        <span className="chat-run-header-kind">{kindLabel}</span>
        <strong className="chat-run-header-label" title={label}>
          {label}
        </strong>
        {skillLabel ? (
          <span className="chat-run-header-skill" title={skillName || skillLabel}>
            {skillLabel}
          </span>
        ) : null}
        {showReturnDefault && onReturnDefault ? (
          <button
            type="button"
            className="chat-run-header-return"
            onClick={onReturnDefault}
          >
            Return Default
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
