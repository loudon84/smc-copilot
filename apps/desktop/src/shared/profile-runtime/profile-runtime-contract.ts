export type ProfileRuntimeStatus =
  | "not_deployed"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "failed";

export type RuntimeType = "hermes-local" | "hermes-remote" | "tool-only" | "docker-hermes" | "browser-operator" | "feishu-bridge";

export type ProfileRole = "aios-controller" | "specialist";

export type ShareMode = "snapshot" | "summary" | "full";

export type CapabilityName = "delegation" | "skill-sync" | "session-share" | "web-operator" | "gateway-supervisor";

export type NavGroup = "aios" | "experts" | "runtime" | "operator";

export type AuditActor = "user" | "hermes" | "system";

export type AuditResult = "success" | "failed" | "blocked";

export type ProfileErrorCode =
  | "PROFILE_NOT_FOUND"
  | "PROFILE_ALREADY_EXISTS"
  | "PROFILE_INVALID_NAME"
  | "PROFILE_CONFIG_INVALID"
  | "PROFILE_PORT_CONFLICT"
  | "PROFILE_RUNTIME_NOT_DEPLOYED"
  | "PROFILE_RUNTIME_START_FAILED"
  | "PROFILE_RUNTIME_STOP_FAILED"
  | "PROFILE_GATEWAY_HEALTH_TIMEOUT"
  | "PROFILE_STARTUP_TIMEOUT"
  | "PROFILE_ADAPTER_NOT_FOUND"
  | "PROFILE_CAPABILITY_NOT_ENABLED"
  | "PROFILE_DELEGATION_FAILED"
  | "PROFILE_SKILL_NOT_FOUND"
  | "PROFILE_SKILL_COPY_FAILED"
  | "PROFILE_CONTEXT_SOURCE_SESSION_NOT_FOUND"
  | "PROFILE_CONTEXT_SHARE_FAILED"
  | "PROFILE_ENTRY_NOT_FOUND"
  | "PROFILE_ENTRY_ROUTE_CONFLICT"
  | "WEB_OPERATOR_PROFILE_NOT_ALLOWED";

export interface ProfileErrorResult {
  ok: false;
  errorCode: ProfileErrorCode;
  message: string;
}

export interface ProfileRecord {
  id: string;
  name: string;
  display_name: string;
  role: ProfileRole;
  description: string | null;
  runtime_type: RuntimeType;
  profile_home: string;
  enabled: boolean;
  auto_start: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RuntimeInstanceRecord {
  id: string;
  profile_id: string;
  runtime_type: RuntimeType;
  host: string;
  port: number;
  base_url: string;
  status: ProfileRuntimeStatus;
  pid: number | null;
  started_at: string | null;
  stopped_at: string | null;
  last_health_check_at: string | null;
  last_error: string | null;
  restart_count: number;
  last_exit_code: number | null;
  last_crash_at: string | null;
  auto_restart: boolean;
  health_fail_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileEntryRecord {
  id: string;
  profile_id: string;
  entry_type: string;
  route: string;
  title: string;
  icon: string | null;
  enabled: boolean;
  sort_order: number;
  config_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileCapabilityRecord {
  id: string;
  profile_id: string;
  capability_name: CapabilityName;
  enabled: boolean;
  config_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileSkillRecord {
  id: string;
  profile_id: string;
  skill_path: string;
  skill_name: string;
  category: string | null;
  source_type: string;
  source_profile_id: string | null;
  filesystem_path: string;
  checksum: string | null;
  enabled: boolean;
  installed_at: string;
  updated_at: string;
}

export interface SkillSyncEventRecord {
  id: string;
  source_profile_id: string;
  target_profile_id: string;
  skill_path: string;
  action: string;
  overwrite: boolean;
  backup_path: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface SharedContextRecord {
  id: string;
  source_profile_id: string;
  source_session_id: string;
  target_profile_id: string;
  mode: ShareMode;
  title: string | null;
  summary: string | null;
  context_file_path: string;
  message_count: number;
  max_chars: number | null;
  checksum: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DelegationEventRecord {
  id: string;
  from_profile_id: string;
  to_profile_id: string;
  request_message: string;
  context_refs_json: string | null;
  response_summary: string | null;
  target_session_id: string | null;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface AuditEventRecord {
  id: string;
  event_type: string;
  profile_id: string | null;
  source: string;
  action: string;
  payload_json: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface ProfileSummary {
  id: string;
  name: string;
  display_name: string;
  role: ProfileRole;
  description: string | null;
  runtime_type: RuntimeType;
  profile_home: string;
  enabled: boolean;
  auto_start: boolean;
  sort_order: number;
  runtime_status: ProfileRuntimeStatus;
  port: number;
  pid: number | null;
  capabilities: CapabilityName[];
}

export interface ProfileGatewayState {
  profileId: string;
  status: ProfileRuntimeStatus;
  port: number;
  pid: number | null;
  baseUrl: string;
  lastError: string | null;
}

export interface DelegateToProfileRequest {
  fromProfile: string;
  toProfile: string;
  message: string;
  includeContextRefs?: string[];
  stream?: boolean;
}

export interface DelegateToProfileResult {
  ok: boolean;
  fromProfile: string;
  toProfile: string;
  response?: string;
  targetSessionId?: string;
  errorCode?: ProfileErrorCode;
  message?: string;
}

export interface CopySkillRequest {
  sourceProfileId: string;
  targetProfileIds: string[];
  skillPath: string;
  overwrite?: boolean;
}

export interface CopySkillResult {
  ok: boolean;
  sourceProfileId: string;
  targetProfileId: string;
  skillPath: string;
  action: "copied" | "skipped" | "overwritten" | "failed";
  errorCode?: ProfileErrorCode;
  message?: string;
}

export interface ShareSessionContextRequest {
  sourceProfileId: string;
  sourceSessionId: string;
  targetProfileIds: string[];
  mode: ShareMode;
  title?: string;
  maxChars?: number;
}

export interface ShareSessionContextResult {
  ok: boolean;
  sourceProfileId: string;
  sourceSessionId: string;
  targetProfileId: string;
  contextFilePath: string;
  errorCode?: ProfileErrorCode;
  message?: string;
}

export interface ProfileSkillSummary {
  id: string;
  profileId: string;
  skillPath: string;
  skillName: string;
  category: string | null;
  sourceType: string;
  enabled: boolean;
}

export interface ProfileSessionSummary {
  id: string;
  title: string | null;
  startedAt: number;
  messageCount: number;
  model: string;
}

export interface SharedContextRef {
  id: string;
  sourceProfileId: string;
  sourceSessionId: string;
  targetProfileId: string;
  mode: ShareMode;
  title: string | null;
  contextFilePath: string;
  messageCount: number;
  status: string;
  createdAt: string;
}

export interface AuditEventFilter {
  profileId?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}

export interface ImportRuntimeConfigResult {
  ok: boolean;
  importedCount: number;
  errors: Array<{ profileName: string; errorCode: ProfileErrorCode; message: string }>;
}

export interface ProfileEntrySummary {
  profileId: string;
  entryType: string;
  route: string;
  title: string;
  icon: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface ProfilePageLayout {
  profileId: string;
  layoutJson: string;
}

export interface OpenProfileEntryResult {
  profileId: string;
  entryType: string;
  route: string;
  title: string;
  screenConfig: Record<string, unknown>;
}

export interface RuntimeReconcileResult {
  reconciledCount: number;
  corrections: Array<{
    profileId: string;
    previousStatus: ProfileRuntimeStatus;
    correctedStatus: ProfileRuntimeStatus;
    reason: string;
  }>;
}

export type GatewayLogLevel = "stdout" | "stderr" | "info" | "warn" | "error";

export interface GatewayLogEntry {
  timestamp: string;
  level: GatewayLogLevel;
  message: string;
  profileId: string;
}

export interface GatewayLogQueryOptions {
  limit?: number;
  level?: GatewayLogLevel;
  since?: string;
}

export interface RuntimeStatusChangeEvent {
  profileId: string;
  previousStatus: ProfileRuntimeStatus;
  newStatus: ProfileRuntimeStatus;
  reason?: string;
  timestamp: string;
}

export interface ProfileRuntimeAPI {
  importConfig(filePath: string): Promise<ImportRuntimeConfigResult>;
  listProfiles(): Promise<ProfileSummary[]>;
  getProfile(profileId: string): Promise<ProfileSummary | null>;
  startProfile(profileId: string): Promise<ProfileGatewayState>;
  stopProfile(profileId: string): Promise<ProfileGatewayState>;
  restartProfile(profileId: string): Promise<ProfileGatewayState>;
  startAllProfiles(): Promise<ProfileGatewayState[]>;
  stopAllProfiles(): Promise<ProfileGatewayState[]>;
  getRuntimeStatus(): Promise<ProfileGatewayState[]>;
  probeProfileHealth(profileId: string): Promise<{ healthy: boolean }>;
  delegate(input: DelegateToProfileRequest): Promise<DelegateToProfileResult>;
  listProfileSkills(profileId: string): Promise<ProfileSkillSummary[]>;
  copySkill(input: CopySkillRequest): Promise<CopySkillResult[]>;
  listProfileSessions(profileId: string): Promise<ProfileSessionSummary[]>;
  deleteProfileSession(profileId: string, sessionId: string): Promise<{ ok: boolean }>;
  shareSessionContext(input: ShareSessionContextRequest): Promise<ShareSessionContextResult[]>;
  listSharedContexts(profileId: string): Promise<SharedContextRef[]>;
  deleteSharedContext(contextId: string): Promise<{ ok: boolean }>;
  listAuditEvents(filter: AuditEventFilter): Promise<AuditEventRecord[]>;
  getGatewayLogs(profileId: string, options?: GatewayLogQueryOptions): Promise<GatewayLogEntry[]>;
  onRuntimeStatusChanged(callback: (event: RuntimeStatusChangeEvent) => void): () => void;
  setAutoRestart(profileId: string, enabled: boolean): Promise<void>;
}

export interface ProfileEntryAPI {
  listProfileEntries(): Promise<ProfileEntrySummary[]>;
  getProfileEntry(profileId: string): Promise<ProfileEntrySummary | null>;
  openProfileEntry(profileId: string): Promise<OpenProfileEntryResult>;
  getProfilePageLayout(profileId: string): Promise<ProfilePageLayout>;
  updateProfilePageLayout(profileId: string, layout: ProfilePageLayout): Promise<ProfilePageLayout>;
}
