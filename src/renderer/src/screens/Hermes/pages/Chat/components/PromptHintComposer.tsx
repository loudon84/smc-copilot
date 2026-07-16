import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, RotateCcw } from "lucide-react";
import {
  buildExpertPromptHint,
  shouldBuildExpertPromptHint,
  type ExpertPromptHintInput,
} from "../utils/buildExpertPromptHint";

type Props = {
  userMessage: string;
  hintInput: Omit<ExpertPromptHintInput, "userMessage"> | null;
  /** When set, send uses this hint instead of the default template. */
  onHintChange?: (hint: string | null) => void;
};

export function PromptHintComposer({
  userMessage,
  hintInput,
  onHintChange,
}: Props): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [editedHint, setEditedHint] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!hintInput) return false;
    return shouldBuildExpertPromptHint({
      expertName: hintInput.expertName,
      skillName: hintInput.skillName,
    });
  }, [hintInput]);

  const defaultHint = useMemo(() => {
    if (!visible || !hintInput) return "";
    return buildExpertPromptHint({
      ...hintInput,
      userMessage: userMessage.trim() || "(empty message)",
    });
  }, [hintInput, userMessage, visible]);

  useEffect(() => {
    if (!visible) {
      setEditedHint(null);
      onHintChange?.(null);
      return;
    }
    const next = editedHint ?? defaultHint;
    onHintChange?.(next);
  }, [defaultHint, editedHint, onHintChange, visible]);

  const displayHint = editedHint ?? defaultHint;

  const handleReset = useCallback(() => {
    setEditedHint(null);
    onHintChange?.(defaultHint);
  }, [defaultHint, onHintChange]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(displayHint);
  }, [displayHint]);

  if (!visible) return null;

  return (
    <div className="hermes-webchat-prompt-hint">
      <button
        type="button"
        className="hermes-webchat-prompt-hint__toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Prompt Hint</span>
      </button>
      {open ? (
        <div className="hermes-webchat-prompt-hint__panel">
          <textarea
            className="hermes-webchat-prompt-hint__editor"
            value={displayHint}
            onChange={(e) => setEditedHint(e.target.value)}
            rows={8}
          />
          <div className="hermes-webchat-prompt-hint__actions">
            <button type="button" className="hermes-btn hermes-btn--ghost" onClick={handleCopy}>
              <Copy size={14} />
              复制
            </button>
            <button type="button" className="hermes-btn hermes-btn--ghost" onClick={handleReset}>
              <RotateCcw size={14} />
              恢复默认
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use PromptHintComposer */
export const PromptHintPreview = PromptHintComposer;
