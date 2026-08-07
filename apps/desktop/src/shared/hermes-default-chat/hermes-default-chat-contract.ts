/** Local Hermes default profile chat — Renderer/Main/Preload contract (v5.6.4). */

export type HermesChatModel = {
  id: string;
  label: string;
  provider?: string | null;
  base_url?: string | null;
  model: string;
  api_key_env?: string | null;
  api_key_literal?: string | null;
  source: string;
  is_current: boolean;
};

export type HermesChatModelListResponse = {
  profile_id: string;
  models: HermesChatModel[];
  status?: string | null;
};

export type HermesChatModelConfig = {
  profile_id: string;
  provider: string;
  model_id: string;
  model_label?: string | null;
  base_url?: string | null;
  updated_at: string;
};

/** Models 页面 Set Default 专用；Chat 不得调用。 */
export type SetHermesChatModelConfigPayload = {
  model_id: string;
};

export type HermesSessionModelBinding = {
  modelId: string;
  model: string;
  provider: string;
  baseUrl: string;
  apiKeyEnv?: string | null;
  apiKeyLiteral?: string | null;
  updatedAt: string;
};

export type HermesChatAttachmentMeta = {
  id: string;
  profile_id: string;
  session_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  text_preview?: string | null;
};

export type UploadHermesAttachmentsPayload = {
  profile?: string;
  session_id: string;
  file_paths?: string[];
};

export type HermesChatAttachmentBuffer = {
  name: string;
  mime_type?: string;
  data: number[];
};

export type UploadHermesAttachmentBuffersPayload = {
  profile?: string;
  session_id: string;
  files: HermesChatAttachmentBuffer[];
};

export type UploadHermesAttachmentsResponse = {
  attachments: HermesChatAttachmentMeta[];
};

export type HermesChatSendPayload = {
  message: string;
  profile?: string;
  resumeSessionId?: string;
  history?: Array<{ role: string; content: string }>;
  attachment_ids?: string[];
  /** Upload IPC 返回的元数据；index 未命中时 Main 用此拼 AttachmentMeta。 */
  attachment_metas?: HermesChatAttachmentMeta[];
  model_id?: string;
  /** v1.0 Experts Workspace */
  expert_id?: string;
  team_id?: string;
  expert_run_id?: string;
  work_mode?: "ask" | "plan" | "craft";
  invocation_source?: "default_chat" | "expert_chat" | "team_chat";
};

export type HermesChatUsageEvent = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
};
