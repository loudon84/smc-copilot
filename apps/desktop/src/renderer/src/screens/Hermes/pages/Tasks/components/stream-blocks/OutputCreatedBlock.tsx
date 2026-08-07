import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

type Props = {
  event: WorkTaskEvent;
  onOpenPreview?: (outputId: string) => void;
};

export function OutputCreatedBlock({ event, onOpenPreview }: Props) {
  const { t } = useTranslation();
  if (
    event.type !== "output.created" &&
    event.type !== "output.updated" &&
    event.type !== "output.saved"
  ) {
    return null;
  }
  return (
    <div className="hermes-stream-block hermes-stream-block--output">
      <FileText size={16} />
      <div>
        <div className="hermes-stream-block__title">{t("workspaces.hermes.tasks.stream.outputCreated")}</div>
        <p>{event.name}</p>
        <button
          type="button"
          className="hermes-btn-ghost"
          onClick={() => onOpenPreview?.(event.outputId)}
        >
          {t("workspaces.hermes.tasks.stream.openPreview")}
        </button>
      </div>
    </div>
  );
}
