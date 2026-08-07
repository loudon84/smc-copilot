import type { ProfileErrorCode } from "./profile-runtime-contract";

const ERROR_MESSAGES: Record<ProfileErrorCode, string> = {
  PROFILE_NOT_FOUND: "Profile not found",
  PROFILE_ALREADY_EXISTS: "Profile already exists",
  PROFILE_INVALID_NAME: "Invalid profile name",
  PROFILE_CONFIG_INVALID: "Invalid profile configuration",
  PROFILE_PORT_CONFLICT: "Port conflict detected",
  PROFILE_RUNTIME_NOT_DEPLOYED: "Profile runtime not deployed",
  PROFILE_RUNTIME_START_FAILED: "Profile runtime start failed",
  PROFILE_RUNTIME_STOP_FAILED: "Profile runtime stop failed",
  PROFILE_GATEWAY_HEALTH_TIMEOUT: "Gateway health check timeout",
  PROFILE_STARTUP_TIMEOUT: "Gateway startup timed out",
  PROFILE_ADAPTER_NOT_FOUND: "Runtime adapter not found",
  PROFILE_CAPABILITY_NOT_ENABLED: "Capability not enabled for this profile",
  PROFILE_DELEGATION_FAILED: "Delegation failed",
  PROFILE_SKILL_NOT_FOUND: "Skill not found",
  PROFILE_SKILL_COPY_FAILED: "Skill copy failed",
  PROFILE_CONTEXT_SOURCE_SESSION_NOT_FOUND: "Source session not found",
  PROFILE_CONTEXT_SHARE_FAILED: "Context share failed",
  PROFILE_ENTRY_NOT_FOUND: "Profile entry not found",
  PROFILE_ENTRY_ROUTE_CONFLICT: "Profile entry route conflict",
  WEB_OPERATOR_PROFILE_NOT_ALLOWED: "Web Operator not allowed for this profile",
};

export function createProfileError(errorCode: ProfileErrorCode, detail?: string) {
  return {
    ok: false as const,
    errorCode,
    message: detail ? `${ERROR_MESSAGES[errorCode]}: ${detail}` : ERROR_MESSAGES[errorCode],
  };
}

export class ProfileRuntimeError extends Error {
  constructor(
    public readonly errorCode: ProfileErrorCode,
    detail?: string,
  ) {
    super(detail ? `${ERROR_MESSAGES[errorCode]}: ${detail}` : ERROR_MESSAGES[errorCode]);
    this.name = "ProfileRuntimeError";
  }
}
