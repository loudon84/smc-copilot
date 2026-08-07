export type {
  DeploymentConfig,
  DeploymentDesktop,
  DeploymentRuntimeBundle,
  DeploymentHermesAgent,
  DeploymentRuntime,
  DeploymentProfiles,
  DeploymentGateway,
  DeploymentModelProvider,
  DeploymentModels,
  DeploymentSecurity,
  DeploymentPolicy,
  DeploymentDoctor,
  InstallMarker,
  RollbackSnapshot,
  InstallLogEntry,
  PreflightCheckResult,
  PreflightReport,
  DoctorCheckResult,
  DoctorReport,
  InstallProgressEvent,
  EnterpriseErrorResult,
  EnterpriseResult,
  LoadConfigResult,
  ValidationFieldError,
  ValidationResult,
} from "./enterprise-schema";

export { isEnterpriseError } from "./enterprise-schema";

export type {
  InstallStage,
  PreflightSeverity,
  PreflightStatus,
  DoctorCheckStatus,
  RepairLevel,
  RollbackTarget,
  InstallMode,
  InstallScope,
  BundleSourceType,
  AgentSourceType,
  AgentAuthMode,
  InstallPhase,
  EnterpriseInstallScreen,
  EnterpriseErrorCode,
  ProfileName,
} from "./enterprise-constants";

export {
  INSTALL_STAGES,
  INSTALL_STAGE_WEIGHTS,
  ENTERPRISE_ERROR_MESSAGES,
  DEFAULT_PROFILE_NAMES,
  DEFAULT_PROFILE_PORTS,
} from "./enterprise-constants";

import type {
  DeploymentConfig,
  InstallMarker,
  PreflightReport,
  DoctorReport,
  InstallProgressEvent,
  LoadConfigResult,
  RollbackSnapshot,
  ValidationResult,
} from "./enterprise-schema";

import type {
  ProfileName,
  RepairLevel,
  RollbackTarget,
  InstallPhase,
} from "./enterprise-constants";

export interface EnterpriseInstallInput {
  skipPreflight?: boolean;
  skipDoctor?: boolean;
  /** When true, re-run pipeline even if install-marker exists. */
  force?: boolean;
}

export interface EnterpriseInstallResult {
  ok: boolean;
  marker?: InstallMarker;
  doctorReport?: DoctorReport;
  errorCode?: string;
  message?: string;
}

export interface EnterpriseUpdateInput {
  target: "desktop" | "agent" | "both";
}

export interface EnterpriseUpdateResult {
  ok: boolean;
  message?: string;
  errorCode?: string;
}

export interface EnterpriseRepairInput {
  level: RepairLevel;
  profileId?: string;
}

export interface EnterpriseRepairResult {
  ok: boolean;
  level: RepairLevel;
  doctorReport?: DoctorReport;
  message?: string;
  errorCode?: string;
}

export interface EnterpriseRollbackInput {
  target: RollbackTarget;
  snapshotPath?: string;
}

export interface EnterpriseRollbackResult {
  ok: boolean;
  message?: string;
  errorCode?: string;
}

export type InstallerPrecheckStatus = "pass" | "missing";
export type InstallerPortStatus = "available" | "occupied";
export type InstallerPrecheckResult = "pass" | "warning" | "error";

export interface InstallerPrecheck {
  schemaVersion: string;
  createdAt?: string;
  windowsVersion?: string;
  vcRuntime: InstallerPrecheckStatus;
  git: InstallerPrecheckStatus;
  python: InstallerPrecheckStatus;
  uv: InstallerPrecheckStatus;
  port8642: InstallerPortStatus;
  installDir: string;
  runtimeRoot: string;
  binDir: string;
  result: InstallerPrecheckResult;
}

export interface RuntimeDoctorInput {
  profileId?: string;
  checks?: string[];
}

export interface EnterpriseInstallAPI {
  getDeploymentConfig(): Promise<LoadConfigResult>;
  validateDeploymentConfig(): Promise<ValidationResult>;

  runPreflight(): Promise<PreflightReport>;

  install(input?: EnterpriseInstallInput): Promise<EnterpriseInstallResult>;
  cancelInstall(): Promise<{ ok: boolean }>;

  update(input?: EnterpriseUpdateInput): Promise<EnterpriseUpdateResult>;
  repair(input?: EnterpriseRepairInput): Promise<EnterpriseRepairResult>;
  rollback(input: EnterpriseRollbackInput): Promise<EnterpriseRollbackResult>;

  getInstallMarker(): Promise<InstallMarker | null>;
  getInstallLog(input: { type: InstallPhase }): Promise<string>;
  openLogDir(): Promise<{ ok: boolean }>;

  runDoctor(input?: RuntimeDoctorInput): Promise<DoctorReport>;
  exportDoctorReport(): Promise<{ ok: boolean; path: string }>;

  onInstallProgress(
    cb: (progress: InstallProgressEvent) => void,
  ): () => void;
}
