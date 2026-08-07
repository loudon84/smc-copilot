import type { WorkError } from "./work-error-contract";
import type { WorkFileChange } from "./work-output-contract";
import type { ParticipantStatus } from "./work-participant-contract";
import type { WorkOutputType } from "./work-output-contract";

export type WorkTaskEventSource =
  | "desktop"
  | "workspace_chat"
  | "nodeskclaw"
  | "hermes_agent"
  | "mcp_gateway"
  | "browser"
  | "system";

export type WorkTaskEventType =
  | "task.created"
  | "task.started"
  | "task.status.changed"
  | "task.completed"
  | "task.failed"
  | "task.cancelled"
  | "agent.message.delta"
  | "agent.message.completed"
  | "agent.thinking_summary"
  | "team.created"
  | "team.plan.created"
  | "team.member.assigned"
  | "team.member.started"
  | "team.member.delta"
  | "team.member.completed"
  | "team.member.failed"
  | "team.merge.started"
  | "team.merge.completed"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "tool.failed"
  | "approval.required"
  | "approval.granted"
  | "approval.rejected"
  | "output.created"
  | "output.updated"
  | "output.saved"
  | "error";

export interface BaseWorkTaskEvent {
  id: string;
  taskId: string;
  type: WorkTaskEventType;
  createdAt: string;
  source: WorkTaskEventSource;
  payload?: Record<string, unknown>;
}

export interface TaskLifecycleEvent extends BaseWorkTaskEvent {
  type:
    | "task.created"
    | "task.started"
    | "task.status.changed"
    | "task.completed"
    | "task.failed"
    | "task.cancelled";
  status?: string;
  title?: string;
}

export interface AgentMessageEvent extends BaseWorkTaskEvent {
  type: "agent.message.delta" | "agent.message.completed";
  participantId?: string;
  participantName?: string;
  content: string;
  messageId?: string;
}

export interface ThinkingSummaryEvent extends BaseWorkTaskEvent {
  type: "agent.thinking_summary";
  participantId: string;
  title: string;
  summary: string;
  steps?: string[];
}

export interface TeamCreatedEvent extends BaseWorkTaskEvent {
  type: "team.created";
  teamName: string;
  taskGoal?: string;
  status?: string;
  members?: Array<{ id: string; name: string; role?: string }>;
}

export interface TeamPlanEvent extends BaseWorkTaskEvent {
  type: "team.plan.created";
  planTitle: string;
  steps: string[];
  memberAssignments?: Array<{ memberId: string; memberName: string; subTask: string }>;
  estimatedOutput?: string;
}

export interface TeamMemberEvent extends BaseWorkTaskEvent {
  type:
    | "team.member.assigned"
    | "team.member.started"
    | "team.member.delta"
    | "team.member.completed"
    | "team.member.failed";
  memberId: string;
  memberName: string;
  role?: string;
  subTaskTitle?: string;
  status?: ParticipantStatus;
  summary?: string;
  content?: string;
  outputRefIds?: string[];
}

export interface TeamMergeEvent extends BaseWorkTaskEvent {
  type: "team.merge.started" | "team.merge.completed";
  summary?: string;
}

export interface ToolEvent extends BaseWorkTaskEvent {
  type: "tool.started" | "tool.progress" | "tool.completed" | "tool.failed";
  toolCallId: string;
  toolName: string;
  displayName?: string;
  status: "started" | "running" | "completed" | "failed";
  inputSummary?: string;
  outputSummary?: string;
  fileChanges?: WorkFileChange[];
  error?: WorkError;
}

export interface ApprovalEvent extends BaseWorkTaskEvent {
  type: "approval.required" | "approval.granted" | "approval.rejected";
  approvalId: string;
  actionName: string;
  target?: string;
  riskLevel?: "low" | "medium" | "high";
  requestSource?: string;
  details?: string;
}

export interface OutputEvent extends BaseWorkTaskEvent {
  type: "output.created" | "output.updated" | "output.saved";
  outputId: string;
  name: string;
  outputType: WorkOutputType;
  previewable?: boolean;
  localPath?: string;
  remoteRef?: string;
  content?: string;
}

export interface ErrorEvent extends BaseWorkTaskEvent {
  type: "error";
  error: WorkError;
}

export type WorkTaskEvent =
  | TaskLifecycleEvent
  | AgentMessageEvent
  | ThinkingSummaryEvent
  | TeamCreatedEvent
  | TeamPlanEvent
  | TeamMemberEvent
  | TeamMergeEvent
  | ToolEvent
  | ApprovalEvent
  | OutputEvent
  | ErrorEvent;
