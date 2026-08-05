import { memo } from "react";
import { Bot, Loader2 } from "lucide-react";

export type AgentAvatarInfo = {
  name: string;
  color?: string | null;
  avatar?: string | null;
};

/** Production agent avatar — spinner while active, bot/letter when idle. */
export const HermesAvatar = memo(function HermesAvatar({
  size = 30,
  active = false,
  agent,
}: {
  size?: number;
  active?: boolean;
  agent?: AgentAvatarInfo;
}): React.JSX.Element {
  if (active) {
    return (
      <div className="chat-avatar chat-avatar-agent chat-avatar-orb">
        <Loader2
          size={Math.max(16, size - 6)}
          className="chat-avatar-spinner"
          aria-label="thinking"
        />
      </div>
    );
  }
  if (agent?.avatar) {
    return (
      <div className="chat-avatar chat-avatar-agent">
        <img
          src={agent.avatar}
          alt={agent.name}
          width={size}
          height={size}
          style={{ borderRadius: "50%", objectFit: "cover" }}
        />
      </div>
    );
  }
  if (agent?.name && agent.name !== "default") {
    return (
      <div
        className="chat-avatar chat-avatar-agent chat-avatar-letter"
        style={{
          width: size,
          height: size,
          background: agent.color || "#5b8cff",
          fontSize: Math.round(size * 0.42),
        }}
        aria-label={agent.name}
      >
        {(agent.name.trim()[0] || "?").toUpperCase()}
      </div>
    );
  }
  return (
    <div className="chat-avatar chat-avatar-agent">
      <Bot size={size} strokeWidth={1.5} />
    </div>
  );
});

export const AvatarSpacer = memo(function AvatarSpacer(): React.JSX.Element {
  return <div className="chat-avatar" aria-hidden="true" />;
});
