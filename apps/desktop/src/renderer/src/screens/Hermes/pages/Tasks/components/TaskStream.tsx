import type { StreamBlock } from "../../../features/task-stream/workEventAggregator";
import { getBlockDisplayContent } from "../../../features/task-stream/workEventAggregator";
import { UserMessageBlock } from "./stream-blocks/UserMessageBlock";
import { AgentMessageBlock } from "./stream-blocks/AgentMessageBlock";
import { ThinkingSummaryBlock } from "./stream-blocks/ThinkingSummaryBlock";
import { TeamCreatedBlock } from "./stream-blocks/TeamCreatedBlock";
import { TeamPlanBlock } from "./stream-blocks/TeamPlanBlock";
import { MemberDispatchBlock } from "./stream-blocks/MemberDispatchBlock";
import { MemberProgressBlock } from "./stream-blocks/MemberProgressBlock";
import { ToolCallBlock } from "./stream-blocks/ToolCallBlock";
import { ApprovalBlock } from "./stream-blocks/ApprovalBlock";
import { OutputCreatedBlock } from "./stream-blocks/OutputCreatedBlock";
import { ErrorBlock } from "./stream-blocks/ErrorBlock";

type Props = {
  blocks: StreamBlock[];
  onOpenOutput?: (outputId: string) => void;
};

function DebugEventBlock({ block }: { block: StreamBlock }) {
  return (
    <div className="hermes-stream-block hermes-stream-block--unknown">
      <span className="hermes-stream-block__label">{block.primaryEvent.type}</span>
      <pre className="hermes-stream-block__debug">
        {JSON.stringify(block.primaryEvent.payload ?? block.primaryEvent, null, 2)}
      </pre>
    </div>
  );
}

export function TaskStream({ blocks, onOpenOutput }: Props) {
  return (
    <div className="hermes-task-stream">
      {blocks.map((block) => {
        switch (block.kind) {
          case "user_message":
            return (
              <UserMessageBlock
                key={block.id}
                content={getBlockDisplayContent(block)}
              />
            );
          case "agent_message":
            return (
              <AgentMessageBlock
                key={block.id}
                content={getBlockDisplayContent(block)}
                participantName={
                  block.primaryEvent.type === "agent.message.delta" ||
                  block.primaryEvent.type === "agent.message.completed"
                    ? block.primaryEvent.participantName
                    : undefined
                }
              />
            );
          case "thinking_summary":
            return <ThinkingSummaryBlock key={block.id} event={block.primaryEvent} />;
          case "team_created":
            return <TeamCreatedBlock key={block.id} event={block.primaryEvent} />;
          case "team_plan":
            return <TeamPlanBlock key={block.id} event={block.primaryEvent} />;
          case "member_dispatch":
            return <MemberDispatchBlock key={block.id} event={block.primaryEvent} />;
          case "member_progress":
            return <MemberProgressBlock key={block.id} event={block.primaryEvent} />;
          case "tool_call":
            return <ToolCallBlock key={block.id} events={block.events} />;
          case "approval":
            return <ApprovalBlock key={block.id} event={block.primaryEvent} />;
          case "output_created":
            return (
              <OutputCreatedBlock
                key={block.id}
                event={block.primaryEvent}
                onOpenPreview={onOpenOutput}
              />
            );
          case "error":
            return <ErrorBlock key={block.id} event={block.primaryEvent} />;
          default:
            return <DebugEventBlock key={block.id} block={block} />;
        }
      })}
    </div>
  );
}
