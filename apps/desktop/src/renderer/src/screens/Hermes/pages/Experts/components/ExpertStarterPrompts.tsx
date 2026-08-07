import { useTranslation } from "react-i18next";
import type { WorkStarterPrompt } from "../../../model/expert";

type Props = {
  prompts: WorkStarterPrompt[];
  onSelect: (prompt: string) => void;
};

export function ExpertStarterPrompts({ prompts, onSelect }: Props) {
  const { t } = useTranslation();
  if (prompts.length === 0) return null;
  return (
    <section>
      <h3>{t("workspaces.hermes.experts.detail.starterPrompts")}</h3>
      <ul className="hermes-starter-prompts">
        {prompts.map((p) => (
          <li key={p.title}>
            <button type="button" className="hermes-btn-ghost" onClick={() => onSelect(p.prompt)}>
              <strong>{p.title}</strong>
              <span>{p.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
