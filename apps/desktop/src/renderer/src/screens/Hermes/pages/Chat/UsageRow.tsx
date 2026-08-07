import type { HermesChatUsageEvent } from "../../../../../../shared/hermes-default-chat/hermes-default-chat-contract";

export function UsageRow({ usage }: { usage: HermesChatUsageEvent }): React.JSX.Element {
  return (
    <div className="hermes-webchat-usage">
      <span>
        Tokens: {usage.totalTokens} (prompt {usage.promptTokens}, completion {usage.completionTokens})
      </span>
    </div>
  );
}

