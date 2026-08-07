import { X } from "lucide-react";
import type { UseWorkChatContextReturn } from "../../../../types/work-chat";

const LABELS = {
  gateway: "Gateway",
  expert: "Expert",
  skill: "Skill",
  permission: "Permission",
  remote: "Remote",
  unavailable: "Unavailable",
  default: "Default",
  askEachTime: "Ask each time",
  clear: "Clear",
} as const;

function gatewayLabel(status: UseWorkChatContextReturn["gatewayStatus"]): string {
  if (status === "remote") return LABELS.remote;
  if (status === "unavailable" || status === "error") return LABELS.unavailable;
  return status;
}

function permissionLabel(mode: UseWorkChatContextReturn["permissionMode"]): string {
  return mode === "ask_each_time" ? LABELS.askEachTime : LABELS.default;
}

type Props = {
  context: UseWorkChatContextReturn;
};

export function WorkChatContextBar({ context }: Props) {
  const { gatewayStatus, selectedExpert, selectedSkill, permissionMode, clearContext } = context;

  const visible =
    selectedExpert != null ||
    selectedSkill != null ||
    gatewayStatus !== "unknown" ||
    permissionMode !== "default";

  if (!visible) return null;

  return (
    <div className="hermes-work-chat-context-bar" role="toolbar" aria-label="Work context">
      {gatewayStatus !== "unknown" ? (
        <span className="hermes-work-context-chip">
          {LABELS.gateway}: {gatewayLabel(gatewayStatus)}
        </span>
      ) : null}
      {selectedExpert ? (
        <span className="hermes-work-context-chip">
          {LABELS.expert}: {selectedExpert.name}
        </span>
      ) : null}
      {selectedSkill ? (
        <span className="hermes-work-context-chip">
          {LABELS.skill}: {selectedSkill.displayName}
        </span>
      ) : null}
      {permissionMode !== "default" ? (
        <span className="hermes-work-context-chip">
          {LABELS.permission}: {permissionLabel(permissionMode)}
        </span>
      ) : null}
      <button type="button" className="hermes-work-context-clear" onClick={clearContext}>
        <X size={12} />
        {LABELS.clear}
      </button>
    </div>
  );
}
