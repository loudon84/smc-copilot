export type ResolvedProfile = {
  profile_id: string;
  name: string;
  display_name?: string;
  gateway_port?: number;
  base_url?: string;
  status: "running" | "stopped" | "failed" | "not_deployed" | "starting" | "stopping";
  healthy: boolean;
};

export type ChatModel = {
  id: string;
  label: string;
  provider?: string | null;
  base_url?: string | null;
  source: string;
  is_current: boolean;
};

export type ChatModelListResponse = {
  profile_id: string;
  models: ChatModel[];
  status?: string | null;
  raw?: Record<string, unknown> | null;
};

export type ProfileChatModelConfig = {
  profile_id: string;
  provider: string;
  model_id: string;
  model_label?: string | null;
  base_url?: string | null;
  updated_at: string;
};

export type SetProfileChatModelConfigPayload = {
  provider: string;
  model_id: string;
  model_label?: string | null;
  base_url?: string | null;
};

export type ChatAttachmentMeta = {
  id: string;
  profile_id: string;
  workspace_id: string;
  session_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  workspace_relative_path: string;
  text_preview?: string | null;
};

export type UploadWorkspaceAttachmentsPayload = {
  profile_id: string;
  workspace_id: string;
  session_id: string;
  file_paths?: string[];
};

/** Renderer drag-drop fallback when OS file path is unavailable. */
export type UploadWorkspaceAttachmentBuffer = {
  name: string;
  mime_type?: string;
  data: number[];
};

export type UploadWorkspaceAttachmentBuffersPayload = {
  profile_id: string;
  workspace_id: string;
  session_id: string;
  files: UploadWorkspaceAttachmentBuffer[];
};

export type UploadWorkspaceAttachmentsResponse = {
  attachments: ChatAttachmentMeta[];
};

export type WorkspaceChatSendPayload = {
  profile_id: string;
  workspace_id: string;
  session_id: string;
  stream_id?: string;
  model?: string | null;
  messages: Array<{ role: string; content: string }>;
  attachments?: string[];
};

export type WorkspaceChatStreamScope = {
  stream_id: string;
  profile_id: string;
  workspace_id: string;
  session_id: string;
};

export type WorkspaceChatChunkEvent = WorkspaceChatStreamScope & { content: string };
export type WorkspaceChatToolProgressEvent = WorkspaceChatStreamScope & {
  name: string;
  label?: string | null;
};
export type WorkspaceChatUsageEvent = WorkspaceChatStreamScope & {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};
export type WorkspaceChatDoneEvent = WorkspaceChatStreamScope & {
  resolved_session_id?: string | null;
};

export type WorkspaceChatSessionMessage = {
  id: number;
  role: string;
  content: string;
  timestamp: number;
};

export type WorkspaceChatSessionMessagesResponse = {
  messages: WorkspaceChatSessionMessage[];
};

export type WorkspaceChatAbortPayload = {
  profile_id: string;
  session_id?: string;
  stream_id?: string;
};
export type WorkspaceChatErrorEvent = WorkspaceChatStreamScope & {
  message: string;
  details?: Record<string, unknown> | null;
};
export type WorkspaceChatStatusEvent = WorkspaceChatStreamScope & {
  status: string;
  message?: string | null;
};
