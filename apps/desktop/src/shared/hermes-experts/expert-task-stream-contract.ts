/** Expert Gateway v6.2 event_stream + SSE task events (v7.5). */

export interface OpenAICompatibleExpertPayload {
  model: string;
  messages: Array<{
    role: "system" | "developer" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_call_id?: string;
  }>;
  stream: true;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  metadata?: {
    source: "copilot-desktop";
    conversation_id?: string;
    workspace_id?: string;
    device_id?: string;
    model_id?: string;
    permission_mode?: "default" | "ask_each_time";
    attachment_ids?: string[];
  };
}

export interface ExpertGatewayAcceptedResult {
  ok: true;
  mode: "event_stream";
  taskId: string;
  taskNo?: string;
  eventSseUrl: string;
  artifactUrl?: string;
  status: "accepted" | "queued" | "running";
  streaming: true;
  rawStructuredContent?: Record<string, unknown>;
}

export interface ExpertGatewaySyncResult {
  ok: true;
  mode: "sync_result";
  responseText: string;
  structuredContent?: Record<string, unknown>;
}

export interface ExpertGatewayCallError {
  ok: false;
  mode?: "event_stream" | "sync_result";
  error: string;
  errorCode?: string;
}

export type ExpertGatewayCallResult =
  | ExpertGatewayAcceptedResult
  | ExpertGatewaySyncResult
  | ExpertGatewayCallError;

export interface SubscribeExpertTaskEventsInput {
  taskId: string;
  taskNo?: string;
  eventSseUrl: string;
  artifactUrl?: string;
}

export interface SubscribeExpertTaskEventsResult {
  ok: true;
  taskId: string;
}

export interface ExpertTaskStartedEvent {
  type: "task.started";
  taskId: string;
  taskNo?: string;
  message?: string;
  createdAt: string;
}

export interface ExpertTaskProgressEvent {
  type: "task.progress";
  taskId: string;
  stage?: string;
  message: string;
  progress?: number;
  createdAt: string;
}

export interface ExpertTaskArtifactReadyEvent {
  type: "task.artifact.ready";
  taskId: string;
  artifactId?: string;
  artifactUrl?: string;
  name?: string;
  mimeType?: string;
  createdAt: string;
}

export interface ExpertTaskCompletedEvent {
  type: "task.completed";
  taskId: string;
  message?: string;
  resultText?: string;
  createdAt: string;
}

export interface ExpertTaskFailedEvent {
  type: "task.failed";
  taskId: string;
  error: string;
  errorCode?: string;
  createdAt: string;
}

export interface ExpertTaskStreamClosedEvent {
  type: "task.stream.closed";
  taskId: string;
  reason?: string;
  createdAt: string;
}

export type ExpertTaskEvent =
  | ExpertTaskStartedEvent
  | ExpertTaskProgressEvent
  | ExpertTaskArtifactReadyEvent
  | ExpertTaskCompletedEvent
  | ExpertTaskFailedEvent
  | ExpertTaskStreamClosedEvent;

export interface ExpertTaskStreamError {
  taskId: string;
  error: string;
  errorCode?: string;
}

export interface ExpertArtifact {
  artifactId: string;
  taskId: string;
  name: string;
  mimeType?: string;
  artifactUrl?: string;
  previewUrl?: string;
  downloadUrl?: string;
  createdAt?: string;
}

export interface ExpertArtifactPreviewInput {
  artifactId?: string;
  artifactUrl?: string;
  taskId?: string;
}

export interface ExpertArtifactPreview {
  text?: string;
  contentType?: string;
  truncated?: boolean;
}

export interface ExpertArtifactDownloadInput {
  artifactId?: string;
  artifactUrl?: string;
  taskId?: string;
}

export interface ExpertArtifactDownloadResult {
  ok: boolean;
  savedPath?: string;
  error?: string;
  errorCode?: string;
}
