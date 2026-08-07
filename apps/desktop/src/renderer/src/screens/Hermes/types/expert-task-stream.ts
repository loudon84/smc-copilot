import type { ExpertGatewayCallResult } from "../../../../../shared/hermes-experts/expert-task-stream-contract";

export type ExpertTaskTimelineStatus = "accepted" | "running" | "completed" | "failed";

export interface ExpertTaskTimelineEntry {
  taskId: string;
  taskNo?: string;
  expertName?: string;
  skillName?: string;
  status: ExpertTaskTimelineStatus;
  events: import("../../../../../shared/hermes-experts/expert-task-stream-contract").ExpertTaskEvent[];
  eventSseUrl?: string;
  artifactUrl?: string;
  runId?: string;
}

export interface ExpertTaskArtifactView {
  artifactId?: string;
  artifactUrl?: string;
  name: string;
  mimeType?: string;
  taskId: string;
}

export type WorkExpertGatewayCallResult =
  | (ExpertGatewayCallResult & { runId?: string })
  | {
      ok: false;
      error: string;
      errorCode?: string;
    };

export type { ExpertGatewayCallResult };
