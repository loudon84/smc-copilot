import type { ScenarioKey } from "./ScenarioTabs";

const PROMPTS: Record<ScenarioKey, string[]> = {
  office: ["??????", "????", "??????"],
  sales: ["????", "??????", "????"],
  data: ["??????", "??????", "????"],
  docs: ["????", "??????", "????"],
  engineering: ["????", "????", "API ????"],
};

type Props = {
  scenario: ScenarioKey;
  onSelect: (prompt: string) => void;
};

export function QuickPromptChips({ scenario, onSelect }: Props) {
  return (
    <div className="hermes-task-quick-chips">
      {PROMPTS[scenario].map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="hermes-task-chip"
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
