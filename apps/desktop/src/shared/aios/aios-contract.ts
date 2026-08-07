// ---------------------------------------------------------------------------
// Portal Runtime shared contract types
// Used across Main, Preload, and Renderer layers.
// ---------------------------------------------------------------------------

/** Identifies each managed local service. */
export type AiOsServiceId =
  | "hermes-gateway"
  | "aios-backend"
  | "aios-frontend"
  | "copilot-serve"
  | "postgres";

/** Lifecycle status for any runtime service. */
export type RuntimeServiceStatus =
  | "unknown"
  | "not_installed"
  | "installed"
  | "configuring"
  | "starting"
  | "running"
  | "degraded"
  | "stopping"
  | "stopped"
  | "error";

/** Audit / log event severity. */
export type RuntimeEventLevel = "info" | "warn" | "error";

// ---------------------------------------------------------------------------
// DB record types — mirror the runtime_services / runtime_events tables
// ---------------------------------------------------------------------------

export interface RuntimeServiceRecord {
  service_id: AiOsServiceId;
  service_type: string;
  display_name: string;
  status: RuntimeServiceStatus;
  pid: number | null;
  port: number | null;
  url: string | null;
  install_path: string | null;
  started_at: string | null;
  stopped_at: string | null;
  last_health_at: string | null;
  last_error: string | null;
  restart_count: number;
  updated_at: string;
}

export interface RuntimeEventRecord {
  id: string;
  service_id: string;
  event_type: string;
  level: RuntimeEventLevel;
  message: string;
  payload_json: string | null;
  created_at: string;
}

export interface RuntimeSettingRecord {
  key: string;
  value_json: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// View-model types — consumed by Renderer
// ---------------------------------------------------------------------------

export interface AiOsRuntimeStatus {
  services: RuntimeServiceRecord[];
  overall: RuntimeServiceStatus;
}

/** Live health snapshot for Portal Home — always includes three core services. */
export interface AiOsRuntimeSnapshot {
  services: RuntimeServiceRecord[];
  ready: boolean;
  webAppUrl?: string;
}

export interface AiOsPortalInfo {
  installed: boolean;
  portalRoot: string | null;
  portalRuntimeRoot: string;
  envPortalRoot: string | null;
  configPortalRoot: string | null;
}

export interface AiOsInstallOptions {
  sourceType: "git" | "local-zip";
  gitUrl?: string;
  localZipPath?: string;
  branch?: string;
}

export interface AiOsInstallResult {
  ok: boolean;
  installPath?: string;
  errorCode?: AiOsErrorCode;
  message?: string;
}

export interface AiOsLogEntry {
  timestamp: string;
  level: RuntimeEventLevel;
  message: string;
  service: AiOsServiceId;
}

export interface AiOsLogQueryOptions {
  limit?: number;
  level?: RuntimeEventLevel;
  since?: string;
}

export interface RuntimeStatusChangeEvent {
  serviceId: AiOsServiceId;
  previousStatus: RuntimeServiceStatus;
  newStatus: RuntimeServiceStatus;
  reason?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type AiOsErrorCode =
  | "AIOS_NOT_INSTALLED"
  | "AIOS_INSTALL_FAILED"
  | "AIOS_ALREADY_RUNNING"
  | "AIOS_START_FAILED"
  | "AIOS_STOP_FAILED"
  | "AIOS_HEALTH_TIMEOUT"
  | "AIOS_PORT_CONFLICT"
  | "AIOS_ENV_WRITE_FAILED"
  | "AIOS_DB_MIGRATE_FAILED"
  | "AIOS_POSTGRES_UNREACHABLE"
  | "AIOS_FRONTEND_UNREACHABLE"
  | "AIOS_BACKEND_UNREACHABLE"
  | "AIOS_VIEW_FAILED";

export interface AiOsErrorResult {
  ok: false;
  errorCode: AiOsErrorCode;
  message: string;
}

// ---------------------------------------------------------------------------
// Preload API surface
// ---------------------------------------------------------------------------

export type DoctorCheckStatus = "pass" | "warning" | "error" | "skipped";

export interface DoctorCheckResult {
  name: string;
  status: DoctorCheckStatus;
  message: string;
  detail?: string;
}

export interface AiOsDoctorReport {
  timestamp: string;
  checks: DoctorCheckResult[];
  overallStatus: DoctorCheckStatus;
}

export interface AiOsReconcileResult {
  corrections: Array<{
    serviceId: AiOsServiceId;
    previousStatus: RuntimeServiceStatus;
    correctedStatus: RuntimeServiceStatus;
    reason: string;
  }>;
}

export interface PortCheckResult {
  port: number;
  available: boolean;
}

// ---------------------------------------------------------------------------
// Preload API surface
// ---------------------------------------------------------------------------

export interface AiOsAPI {
  getRuntimeStatus(): Promise<AiOsRuntimeStatus>;
  getRuntimeSnapshot(): Promise<AiOsRuntimeSnapshot>;
  installAiOs(options: AiOsInstallOptions): Promise<AiOsInstallResult>;
  startAiOs(): Promise<AiOsRuntimeStatus>;
  stopAiOs(): Promise<AiOsRuntimeStatus>;
  restartAiOs(): Promise<AiOsRuntimeStatus>;
  /** @deprecated 使用 shell:view:set-bounds 路径代替 */
  openAiOsHome(): Promise<void>;
  /** @deprecated 使用 shell:view:set-bounds 路径代替 */
  reloadAiOsHome(): Promise<void>;
  /** @deprecated 使用 shell:view:set-bounds 路径代替 */
  setAiOsViewBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  getAiOsLogs(service: AiOsServiceId, options?: AiOsLogQueryOptions): Promise<AiOsLogEntry[]>;
  runDoctor(): Promise<AiOsDoctorReport>;
  reconcile(): Promise<AiOsReconcileResult>;
  checkPorts(): Promise<PortCheckResult[]>;
  getHomeUrl(): Promise<{ url: string }>;
  getPortalInfo(): Promise<AiOsPortalInfo>;
  onAiOsRuntimeChanged(callback: (event: RuntimeStatusChangeEvent) => void): () => void;
}
