import type { WorkTaskPermissionMode } from "../../../../../../../../shared/work/work-task-contract";
import { useTranslation } from "react-i18next";
import { ComposerPopoverSelect } from "./ComposerPopoverSelect";

const MODES: WorkTaskPermissionMode[] = ["default", "confirm_each", "auto_low_risk"];

type Props = {
  value: WorkTaskPermissionMode;
  onChange: (mode: WorkTaskPermissionMode) => void;
};

export function PermissionSelector({ value, onChange }: Props) {
  const { t } = useTranslation();
  const options = MODES.map((m) => ({
    id: m,
    label: t(`workspaces.hermes.tasks.permission.${m}`, { defaultValue: m }),
  }));

  return (
    <ComposerPopoverSelect
      value={value}
      options={options}
      onChange={(id) => {
        if (id) onChange(id as WorkTaskPermissionMode);
      }}
    />
  );
}
