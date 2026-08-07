import type {
  InstallMode,
  InstallScope,
  BundleSourceType,
  AgentSourceType,
  AgentAuthMode,
  ProfileName,
  PreflightSeverity,
  PreflightStatus,
  DoctorCheckStatus,
  RepairLevel,
  RollbackTarget,
  InstallStage,
  InstallPhase,
  EnterpriseErrorCode,
} from "./enterprise-constants";

export interface DeploymentDesktop {
  channel: string;
  autoUpdate: boolean;
  updateProvider: string;
  updateUrl: string;
}

export interface DeploymentRuntimeBundle {
  sourceType: BundleSourceType;
  bundleUrl: string;
  bundleSha256: string;
  offlineBundlePath: string;
  allowFallbackToGit: boolean;
}

export interface DeploymentHermesAgent {
  sourceType: AgentSourceType;
  version: string;
  gitUrl: string;
  branch: string;
  commit: string;
  tag: string;
  authMode: AgentAuthMode;
  shallowClone: boolean;
}

export interface DeploymentRuntime {
  pythonVersion: string;
  useBundledPython: boolean;
  useBundledGit: boolean;
  useBundledUv: boolean;
  pipIndexUrl: string;
  trustedHost: string;
  preferWheelhouse: boolean;
  wheelhousePath: string;
}

export interface DeploymentProfiles {
  enabled: boolean;
  profileRuntimeYaml: string;
  autoStart: ProfileName[];
  ports: Partial<Record<ProfileName, number>>;
}

export interface DeploymentGateway {
  host: string;
  healthPath: string;
  startupTimeoutMs: number;
  healthIntervalMs: number;
  autoRestart: boolean;
}

export interface DeploymentModelProvider {
  baseUrl: string;
  apiKeyEnv: string;
  fallbackApiKey: string;
}

export interface DeploymentModels {
  defaultProvider: string;
  defaultModel: string;
  providers: Record<string, DeploymentModelProvider>;
}

export interface DeploymentSecurity {
  allowUserEditGitUrl: boolean;
  allowGitBranchSwitch: boolean;
  allowRemoteGateway: boolean;
  verifyBundleSha256: boolean;
  verifyManifestSignature: boolean;
  maskSecretsInLogs: boolean;
  allowedGatewayHost: string;
}

export interface DeploymentPolicy {
  enableProfilePolicy: boolean;
  policyFile: string;
}

export interface DeploymentDoctor {
  runAfterInstall: boolean;
  exportReport: boolean;
}

export interface DeploymentConfig {
  schemaVersion: string;
  company: string;
  installMode: InstallMode;
  installScope: InstallScope;
  desktop: DeploymentDesktop;
  runtimeBundle: DeploymentRuntimeBundle;
  hermesAgent: DeploymentHermesAgent;
  runtime: DeploymentRuntime;
  profiles: DeploymentProfiles;
  gateway: DeploymentGateway;
  models: DeploymentModels;
  security: DeploymentSecurity;
  policy: DeploymentPolicy;
  doctor: DeploymentDoctor;
}

export interface InstallMarker {
  schemaVersion: string;
  installedAt: string;
  desktopVersion: string;
  agentVersion: string;
  bundleSha256: string;
  installPath: string;
  hermesHomePath: string;
  profiles: ProfileName[];
  deploymentConfigHash: string;
  doctorResult: DoctorReport | null;
  rollbackSnapshots: RollbackSnapshot[];
}

export interface RollbackSnapshot {
  target: RollbackTarget;
  path: string;
  createdAt: string;
  checksum: string;
}

export interface InstallLogEntry {
  timestamp: string;
  stage: InstallStage;
  level: "info" | "warn" | "error";
  message: string;
  errorCode?: EnterpriseErrorCode;
  detail?: string;
}

export interface PreflightCheckResult {
  id: string;
  severity: PreflightSeverity;
  status: PreflightStatus;
  message: string;
  detail?: string;
  durationMs: number;
}

export interface PreflightReport {
  checks: PreflightCheckResult[];
  p0Passed: boolean;
  p1Warnings: number;
  p2Infos: number;
  totalDurationMs: number;
}

export interface DoctorCheckResult {
  id: string;
  name: string;
  status: DoctorCheckStatus;
  message: string;
  detail?: string;
  durationMs: number;
}

export interface DoctorReport {
  id: string;
  checks: DoctorCheckResult[];
  overallStatus: DoctorCheckStatus;
  createdAt: string;
  totalDurationMs: number;
}

export interface InstallProgressEvent {
  stage: InstallStage;
  status: "running" | "completed" | "failed" | "cancelled";
  progress: number;
  message: string;
  errorCode?: EnterpriseErrorCode;
  timestamp: string;
}

export interface EnterpriseErrorResult {
  ok: false;
  errorCode: EnterpriseErrorCode;
  message: string;
  detail?: string;
}

export type EnterpriseResult<T> = T | EnterpriseErrorResult;

export function isEnterpriseError<T>(result: EnterpriseResult<T>): result is EnterpriseErrorResult {
  return result !== null && typeof result === "object" && "ok" in result && result.ok === false;
}

export interface ValidationFieldError {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationFieldError[];
}

export interface LoadConfigResult {
  ok: boolean;
  config?: DeploymentConfig;
  usedDefault?: boolean;
  error?: { message: string; fields?: Array<{ path: string; message: string }> };
}
