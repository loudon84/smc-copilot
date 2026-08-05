import { useCallback, useMemo, useState } from "react";
import { Lightbulb, RotateCcw } from "lucide-react";
import type { PromptHintState } from "../../workspace/ChatRunRecord";

type Props = {
  state: PromptHintState;
  autoHint: string;
  density?: "full" | "icon";
  onChange: (next: PromptHintState) => void;
};

/**
 * Prompt hint icon button + floating editor panel (v8.0.3).
 * auto: tracks generated hint; custom: keeps user edits; disabled: skip.
 */
export function PromptAssistPanel({
  state,
  autoHint,
  density = "full",
  onChange,
}: Props): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const display =
    state.mode === "disabled"
      ? ""
      : state.mode === "custom"
        ? state.customValue ?? autoHint
        : autoHint;

  const handleEdit = useCallback(
    (value: string) => {
      onChange({ mode: "custom", customValue: value });
    },
    [onChange],
  );

  const handleReset = useCallback(() => {
    onChange({ mode: "auto" });
  }, [onChange]);

  const handleDisable = useCallback(() => {
    onChange({ mode: "disabled" });
  }, [onChange]);

  const handleEnableAuto = useCallback(() => {
    onChange({ mode: "auto" });
  }, [onChange]);

  const badge = useMemo(() => {
    if (state.mode === "disabled") return "off";
    if (state.mode === "custom") return "custom";
    return "auto";
  }, [state.mode]);

  if (!autoHint && state.mode === "auto") {
    return null;
  }

  return (
    <div className="prompt-hint-popover-wrap">
      <button
        type="button"
        className={`copilot-icon-btn prompt-hint-trigger${
          state.mode !== "auto" ? " is-active" : ""
        }`}
        title={`Prompt Hint (${badge})`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Lightbulb size={16} />
        {density === "full" ? (
          <span className="prompt-hint-trigger-label">Hint</span>
        ) : null}
      </button>
      {open ? (
        <div className="prompt-hint-popover" role="dialog">
          <div className="prompt-hint-popover-header">
            <strong>Prompt Hint</strong>
            <span className="prompt-hint-mode">{badge}</span>
          </div>
          {state.mode === "disabled" ? (
            <p className="prompt-hint-disabled-note">
              Prompt hint disabled for this run.
            </p>
          ) : (
            <textarea
              className="prompt-hint-editor"
              value={display}
              rows={8}
              onChange={(e) => handleEdit(e.target.value)}
            />
          )}
          <div className="prompt-hint-actions">
            {state.mode === "disabled" ? (
              <button type="button" onClick={handleEnableAuto}>
                Enable Auto
              </button>
            ) : (
              <>
                <button type="button" onClick={handleReset}>
                  <RotateCcw size={14} /> Reset Auto
                </button>
                <button type="button" onClick={handleDisable}>
                  Disable
                </button>
              </>
            )}
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function resolveEffectivePromptHint(
  state: PromptHintState | undefined,
  autoHint: string,
  rawUserMessage: string,
): string {
  if (!state || state.mode === "disabled") return rawUserMessage;
  if (state.mode === "custom" && state.customValue?.trim()) {
    return state.customValue.trim();
  }
  return autoHint.trim() || rawUserMessage;
}
