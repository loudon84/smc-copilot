import type { UseWorkChatContextReturn, WorkPermissionMode } from "../../../../types/work-chat";
import { WorkPopoverSelect } from "./WorkPopoverSelect";

const LABELS = {
  permission: "Permission",
  default: "Default",
  askEachTime: "Ask each time",
} as const;

const MODES: WorkPermissionMode[] = ["default", "ask_each_time"];

type Props = {
  context: UseWorkChatContextReturn;
};

export function PermissionSelector({ context }: Props) {
  const { permissionMode, setPermissionMode } = context;
  const options = MODES.map((m) => ({
    id: m,
    label: m === "ask_each_time" ? LABELS.askEachTime : LABELS.default,
  }));

  return (
    <div className="hermes-work-selector">
      <span className="hermes-work-selector__label">{LABELS.permission}</span>
      <WorkPopoverSelect
        value={permissionMode}
        options={options}
        placeholder={LABELS.default}
        placement="top"
        menuWidth={160}
        maxMenuHeight={160}
        onChange={(id) => {
          if (id) setPermissionMode(id as WorkPermissionMode);
        }}
      />
    </div>
  );
}
