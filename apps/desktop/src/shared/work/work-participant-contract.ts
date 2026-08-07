export type ParticipantStatus =
  | "idle"
  | "thinking"
  | "running"
  | "waiting"
  | "completed"
  | "failed";

export type WorkParticipantType = "lead" | "expert" | "team_member" | "tool";

export interface WorkParticipant {
  id: string;
  taskId: string;
  type: WorkParticipantType;
  name: string;
  role?: string;
  avatar?: string;
  status: ParticipantStatus;
  currentAction?: string;
  outputRefIds: string[];
}
