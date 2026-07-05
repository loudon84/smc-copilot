import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  buildExpertPromptHint,
  shouldBuildExpertPromptHint,
  type ExpertPromptHintInput,
} from "../utils/buildExpertPromptHint";

type Props = {
  userMessage: string;
  hintInput: Omit<ExpertPromptHintInput, "userMessage"> | null;
};

export function PromptHintPreview({ userMessage, hintInput }: Props): React.JSX.Element | null {
  const [open, setOpen] = useState(false);

  const visible = useMemo(() => {
    if (!hintInput) return false;
    return shouldBuildExpertPromptHint({
      expertName: hintInput.expertName,
      skillName: hintInput.skillName,
    });
  }, [hintInput]);

  const preview = useMemo(() => {
    if (!visible || !hintInput) return "";
    return buildExpertPromptHint({
      ...hintInput,
      userMessage: userMessage.trim() || "(empty message)",
    });
  }, [hintInput, userMessage, visible]);

  if (!visible) return null;

  return (
    <div className="hermes-prompt-hint-preview">
      <button
        type="button"
        className="hermes-prompt-hint-preview__toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Prompt Hint Preview</span>
      </button>
      {open ? (
        <pre className="hermes-prompt-hint-preview__body">{preview}</pre>
      ) : null}
    </div>
  );
}
