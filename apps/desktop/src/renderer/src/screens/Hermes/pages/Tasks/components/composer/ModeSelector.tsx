import type { WorkTaskMode } from "../../../../../../../../shared/work/work-task-contract";
import { useTranslation } from "react-i18next";
import { ComposerPopoverSelect } from "./ComposerPopoverSelect";

const MODES: WorkTaskMode[] = ["ask", "plan", "craft", "execute"];

type Props = {
  value: WorkTaskMode;
  onChange: (mode: WorkTaskMode) => void;
};

export function ModeSelector({ value, onChange }: Props) {
  const { t } = useTranslation();
  const options = MODES.map((m) => ({
    id: m,
    label: t(`workspaces.hermes.tasks.mode.${m}`, { defaultValue: m }),
  }));

  return (
    <ComposerPopoverSelect
      value={value}
      options={options}
      onChange={(id) => {
        if (id) onChange(id as WorkTaskMode);
      }}
    />
  );
}
