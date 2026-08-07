import { useI18n } from "../../../components/useI18n";
import type { AIOSSkillToolCall } from "../types";

export function ToolCallCard({ tool }: { tool: AIOSSkillToolCall }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="workspaces-chat-tool-card">
      <p>
        <strong>
          {t("workspaces.chat.toolCall", { defaultValue: "Tool" })}: {tool.name}
        </strong>
      </p>
      <p className="workspaces-chat-tool-status">{tool.status}</p>
      {tool.resultPreview ? <pre>{tool.resultPreview}</pre> : null}
    </div>
  );
}
