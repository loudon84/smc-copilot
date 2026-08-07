import type { WorkTaskEvent } from "../../../../../../shared/work/work-event-contract";

export type StreamBlockKind =
  | "user_message"
  | "agent_message"
  | "thinking_summary"
  | "team_created"
  | "team_plan"
  | "member_dispatch"
  | "member_progress"
  | "tool_call"
  | "approval"
  | "output_created"
  | "error"
  | "unknown";

export type StreamBlock = {
  id: string;
  kind: StreamBlockKind;
  events: WorkTaskEvent[];
  primaryEvent: WorkTaskEvent;
};

function kindForEvent(event: WorkTaskEvent): StreamBlockKind {
  switch (event.type) {
    case "agent.message.delta":
    case "agent.message.completed":
      if (event.payload?.role === "user" || event.participantId === "user") {
        return "user_message";
      }
      return "agent_message";
    case "agent.thinking_summary":
      return "thinking_summary";
    case "team.created":
      return "team_created";
    case "team.plan.created":
      return "team_plan";
    case "team.member.assigned":
      return "member_dispatch";
    case "team.member.started":
    case "team.member.delta":
    case "team.member.completed":
    case "team.member.failed":
      return "member_progress";
    case "tool.started":
    case "tool.progress":
    case "tool.completed":
    case "tool.failed":
      return "tool_call";
    case "approval.required":
    case "approval.granted":
    case "approval.rejected":
      return "approval";
    case "output.created":
    case "output.updated":
    case "output.saved":
      return "output_created";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}

function canMerge(block: StreamBlock, event: WorkTaskEvent): boolean {
  if (block.kind !== "agent_message" && block.kind !== "user_message") return false;
  if (event.type !== "agent.message.delta" && event.type !== "agent.message.completed") return false;
  const a = block.primaryEvent;
  if (a.type !== "agent.message.delta" && a.type !== "agent.message.completed") return false;
  if (event.type !== "agent.message.delta" && event.type !== "agent.message.completed") return false;
  return (
    a.messageId === event.messageId &&
    a.participantId === event.participantId
  );
}

function mergeMessageContent(events: WorkTaskEvent[]): string {
  let content = "";
  for (const ev of events) {
    if (ev.type === "agent.message.delta" || ev.type === "agent.message.completed") {
      if (ev.type === "agent.message.completed") {
        content = ev.content;
      } else {
        content += ev.content;
      }
    }
  }
  return content;
}

export function aggregateStreamBlocks(events: WorkTaskEvent[]): StreamBlock[] {
  const blocks: StreamBlock[] = [];

  for (const event of events) {
    if (
      event.type === "task.created" ||
      event.type === "task.started" ||
      event.type === "task.status.changed" ||
      event.type === "task.completed" ||
      event.type === "task.failed" ||
      event.type === "task.cancelled" ||
      event.type === "team.merge.started" ||
      event.type === "team.merge.completed"
    ) {
      continue;
    }

    const last = blocks[blocks.length - 1];
    if (last && canMerge(last, event)) {
      last.events.push(event);
      last.primaryEvent = event;
      continue;
    }

    const kind = kindForEvent(event);
    if (kind === "tool_call" && last?.kind === "tool_call") {
      const lastTool = last.primaryEvent;
      if (
        lastTool.type.startsWith("tool.") &&
        event.type.startsWith("tool.") &&
        "toolCallId" in lastTool &&
        "toolCallId" in event &&
        lastTool.toolCallId === event.toolCallId
      ) {
        last.events.push(event);
        last.primaryEvent = event;
        continue;
      }
    }

    blocks.push({
      id: `block-${event.id}`,
      kind,
      events: [event],
      primaryEvent: event,
    });
  }

  return blocks;
}

export function getBlockDisplayContent(block: StreamBlock): string {
  if (block.kind === "agent_message" || block.kind === "user_message") {
    return mergeMessageContent(block.events);
  }
  return "";
}
