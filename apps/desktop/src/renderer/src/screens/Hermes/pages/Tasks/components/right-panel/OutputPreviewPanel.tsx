import { useTranslation } from "react-i18next";
import type { WorkOutput } from "../../../../../../../../shared/work/work-output-contract";

type Props = {
  outputs: WorkOutput[];
  selectedOutputId?: string;
  onSelect: (outputId: string) => void;
};

export function OutputPreviewPanel({ outputs, selectedOutputId, onSelect }: Props) {
  const { t } = useTranslation();
  const selected = outputs.find((o) => o.id === selectedOutputId) ?? outputs[0];

  if (!selected) {
    return <p className="hermes-task-panel__empty">{t("workspaces.hermes.tasks.rightPanel.noOutput")}</p>;
  }

  return (
    <div className="hermes-task-output-preview">
      <div className="hermes-task-output-preview__tabs">
        {outputs.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`hermes-task-output-preview__tab${o.id === selected.id ? " is-active" : ""}`}
            onClick={() => onSelect(o.id)}
          >
            {o.name}
          </button>
        ))}
      </div>
      <div className="hermes-task-output-preview__content hermes-stream-block__markdown">
        {(selected.content ?? "").split("\n").map((line, i) => (
          <p key={i}>{line.startsWith("#") ? <strong>{line.replace(/^#+\s*/, "")}</strong> : line || "\u00A0"}</p>
        ))}
      </div>
    </div>
  );
}
