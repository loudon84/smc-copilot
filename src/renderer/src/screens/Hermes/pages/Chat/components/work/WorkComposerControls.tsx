import { X } from "lucide-react";
import type { UseWorkChatContextReturn } from "../../../../types/work-chat";
import { ExpertSelector } from "./ExpertSelector";
import { ExpertSkillSelector } from "./ExpertSkillSelector";
import { GatewayStatusBadge } from "./GatewayStatusBadge";
import { PermissionSelector } from "./PermissionSelector";

const LABELS = {
  clear: "Clear",
  mcpHostMode: "Hermes MCP Host",
} as const;

type Props = {
  context: UseWorkChatContextReturn;
};

export function WorkComposerControls({ context }: Props) {
  return (
    <div className="hermes-work-composer-controls">
      <GatewayStatusBadge status={context.gatewayStatus} />
      <ExpertSelector context={context} />
      <ExpertSkillSelector context={context} />
      <PermissionSelector context={context} />
      {context.selectedExpert && context.selectedSkill ? (
        <span className="hermes-work-gateway-hint">{LABELS.mcpHostMode}</span>
      ) : null}
      <button
        type="button"
        className="hermes-work-clear-btn"
        onClick={context.clearContext}
        title={LABELS.clear}
      >
        <X size={14} />
        {LABELS.clear}
      </button>
    </div>
  );
}
