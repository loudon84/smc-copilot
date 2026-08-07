import type { WorkspaceChatUsageEvent } from "../../../../../../shared/workspace-chat/workspace-chat-contract";

export function UsageRow({ usage }: { usage: WorkspaceChatUsageEvent }): React.JSX.Element {
  return (
    <div className="workspaces-webchat-usage">
      <span>
        Tokens: {usage.total_tokens} (prompt {usage.prompt_tokens}, completion{" "}
        {usage.completion_tokens})
      </span>
    </div>
  );
}
