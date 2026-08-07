import type {
  DeploymentConfig,
  ValidationFieldError,
} from "../../shared/enterprise/enterprise-schema";

import type {
  InstallMode,
  InstallScope,
  BundleSourceType,
  AgentSourceType,
  AgentAuthMode,
  ProfileName,
} from "../../shared/enterprise/enterprise-constants";

const VALID_INSTALL_MODES: InstallMode[] = ["windows-native", "wsl2"];
const VALID_INSTALL_SCOPES: InstallScope[] = ["current-user", "all-users"];
const VALID_BUNDLE_SOURCE_TYPES: BundleSourceType[] = ["artifact", "offline", "embedded"];
const VALID_AGENT_SOURCE_TYPES: AgentSourceType[] = ["release-zip", "git-clone"];
const VALID_AUTH_MODES: AgentAuthMode[] = ["none", "ssh-key", "personal-access-token"];
const VALID_PROFILE_NAMES: ProfileName[] = [
  "default",
  "writer",
  "coding",
  "research",
  "recruiters",
  "finance",
  "agenter",
];

export interface SchemaValidationResult {
  ok: boolean;
  errors: ValidationFieldError[];
}

function addError(
  errors: ValidationFieldError[],
  path: string,
  message: string,
): void {
  errors.push({ path, message });
}

function validateString(
  value: unknown,
  path: string,
  errors: ValidationFieldError[],
  required = true,
): value is string {
  if (value === undefined || value === null) {
    if (required) addError(errors, path, "此字段必填");
    return false;
  }
  if (typeof value !== "string") {
    addError(errors, path, "必须为字符串");
    return false;
  }
  return true;
}

function validateNumber(
  value: unknown,
  path: string,
  errors: ValidationFieldError[],
  required = true,
): value is number {
  if (value === undefined || value === null) {
    if (required) addError(errors, path, "此字段必填");
    return false;
  }
  if (typeof value !== "number") {
    addError(errors, path, "必须为数字");
    return false;
  }
  return true;
}

function validateBoolean(
  value: unknown,
  path: string,
  errors: ValidationFieldError[],
  required = true,
): value is boolean {
  if (value === undefined || value === null) {
    if (required) addError(errors, path, "此字段必填");
    return false;
  }
  if (typeof value !== "boolean") {
    addError(errors, path, "必须为布尔值");
    return false;
  }
  return true;
}

function validateEnum<T extends string>(
  value: unknown,
  path: string,
  validValues: T[],
  errors: ValidationFieldError[],
): value is T {
  if (typeof value !== "string" || !validValues.includes(value as T)) {
    addError(errors, path, `必须为以下值之一: ${validValues.join(", ")}`);
    return false;
  }
  return true;
}

function validateObject(
  value: unknown,
  path: string,
  errors: ValidationFieldError[],
  required = true,
): value is Record<string, unknown> {
  if (value === undefined || value === null) {
    if (required) addError(errors, path, "此字段必填");
    return false;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    addError(errors, path, "必须为对象");
    return false;
  }
  return true;
}

export function validateDeploymentConfig(config: unknown): SchemaValidationResult {
  const errors: ValidationFieldError[] = [];

  if (!validateObject(config, "", errors)) {
    return { ok: false, errors };
  }

  const root = config as Record<string, unknown>;

  validateString(root.schemaVersion, "schemaVersion", errors);
  validateString(root.company, "company", errors);
  validateEnum(root.installMode, "installMode", VALID_INSTALL_MODES, errors);
  validateEnum(root.installScope, "installScope", VALID_INSTALL_SCOPES, errors);

  if (validateObject(root.desktop, "desktop", errors)) {
    const d = root.desktop as Record<string, unknown>;
    validateString(d.channel, "desktop.channel", errors);
    validateBoolean(d.autoUpdate, "desktop.autoUpdate", errors);
    validateString(d.updateProvider, "desktop.updateProvider", errors);
    validateString(d.updateUrl, "desktop.updateUrl", errors);
  }

  if (validateObject(root.runtimeBundle, "runtimeBundle", errors)) {
    const rb = root.runtimeBundle as Record<string, unknown>;
    validateEnum(rb.sourceType, "runtimeBundle.sourceType", VALID_BUNDLE_SOURCE_TYPES, errors);
    validateString(rb.bundleUrl, "runtimeBundle.bundleUrl", errors, false);
    validateString(rb.bundleSha256, "runtimeBundle.bundleSha256", errors, false);
    validateString(rb.offlineBundlePath, "runtimeBundle.offlineBundlePath", errors, false);
    validateBoolean(rb.allowFallbackToGit, "runtimeBundle.allowFallbackToGit", errors);

    if (rb.sourceType === "artifact" && !rb.bundleUrl) {
      addError(errors, "runtimeBundle.bundleUrl", "sourceType=artifact 时 bundleUrl 必填");
    }
    if (rb.sourceType === "offline" && !rb.offlineBundlePath) {
      addError(errors, "runtimeBundle.offlineBundlePath", "sourceType=offline 时 offlineBundlePath 必填");
    }
  }

  if (validateObject(root.hermesAgent, "hermesAgent", errors)) {
    const ha = root.hermesAgent as Record<string, unknown>;
    validateEnum(ha.sourceType, "hermesAgent.sourceType", VALID_AGENT_SOURCE_TYPES, errors);
    validateString(ha.version, "hermesAgent.version", errors);
    validateString(ha.gitUrl, "hermesAgent.gitUrl", errors, false);
    validateString(ha.branch, "hermesAgent.branch", errors, false);
    validateEnum(ha.authMode, "hermesAgent.authMode", VALID_AUTH_MODES, errors);
    validateBoolean(ha.shallowClone, "hermesAgent.shallowClone", errors);

    if (ha.sourceType === "git-clone" && !ha.gitUrl) {
      addError(errors, "hermesAgent.gitUrl", "sourceType=git-clone 时 gitUrl 必填");
    }
  }

  if (validateObject(root.runtime, "runtime", errors)) {
    const rt = root.runtime as Record<string, unknown>;
    validateString(rt.pythonVersion, "runtime.pythonVersion", errors);
    validateBoolean(rt.useBundledPython, "runtime.useBundledPython", errors);
    validateBoolean(rt.useBundledGit, "runtime.useBundledGit", errors);
    validateBoolean(rt.useBundledUv, "runtime.useBundledUv", errors);
    validateString(rt.pipIndexUrl, "runtime.pipIndexUrl", errors);
    validateString(rt.trustedHost, "runtime.trustedHost", errors);
    validateBoolean(rt.preferWheelhouse, "runtime.preferWheelhouse", errors);
    validateString(rt.wheelhousePath, "runtime.wheelhousePath", errors, false);
  }

  if (validateObject(root.profiles, "profiles", errors)) {
    const pr = root.profiles as Record<string, unknown>;
    validateBoolean(pr.enabled, "profiles.enabled", errors);
    validateString(pr.profileRuntimeYaml, "profiles.profileRuntimeYaml", errors, false);

    if (Array.isArray(pr.autoStart)) {
      for (const name of pr.autoStart as string[]) {
        if (!VALID_PROFILE_NAMES.includes(name as ProfileName)) {
          addError(errors, "profiles.autoStart", `无效 profile 名称: ${name}`);
        }
      }
    } else {
      addError(errors, "profiles.autoStart", "必须为数组");
    }

    if (validateObject(pr.ports, "profiles.ports", errors, false)) {
      const ports = pr.ports as Record<string, unknown>;
      for (const [name, port] of Object.entries(ports)) {
        if (!VALID_PROFILE_NAMES.includes(name as ProfileName)) {
          addError(errors, `profiles.ports.${name}`, `无效 profile 名称: ${name}`);
        }
        if (typeof port !== "number" || port < 1 || port > 65535) {
          addError(errors, `profiles.ports.${name}`, "端口必须为 1-65535 的数字");
        }
      }
    }
  }

  if (validateObject(root.gateway, "gateway", errors)) {
    const gw = root.gateway as Record<string, unknown>;
    validateString(gw.host, "gateway.host", errors);
    validateString(gw.healthPath, "gateway.healthPath", errors);
    validateNumber(gw.startupTimeoutMs, "gateway.startupTimeoutMs", errors);
    validateNumber(gw.healthIntervalMs, "gateway.healthIntervalMs", errors);
    validateBoolean(gw.autoRestart, "gateway.autoRestart", errors);

    if (gw.host && gw.host !== "127.0.0.1" && gw.host !== "localhost") {
      addError(errors, "gateway.host", "安全约束: 仅允许 127.0.0.1 或 localhost");
    }
  }

  if (validateObject(root.models, "models", errors)) {
    const m = root.models as Record<string, unknown>;
    validateString(m.defaultProvider, "models.defaultProvider", errors);
    validateString(m.defaultModel, "models.defaultModel", errors);
    validateObject(m.providers, "models.providers", errors, false);
  }

  if (validateObject(root.security, "security", errors)) {
    const sec = root.security as Record<string, unknown>;
    validateBoolean(sec.allowUserEditGitUrl, "security.allowUserEditGitUrl", errors);
    validateBoolean(sec.allowGitBranchSwitch, "security.allowGitBranchSwitch", errors);
    validateBoolean(sec.allowRemoteGateway, "security.allowRemoteGateway", errors);
    validateBoolean(sec.verifyBundleSha256, "security.verifyBundleSha256", errors);
    validateBoolean(sec.verifyManifestSignature, "security.verifyManifestSignature", errors);
    validateBoolean(sec.maskSecretsInLogs, "security.maskSecretsInLogs", errors);
    validateString(sec.allowedGatewayHost, "security.allowedGatewayHost", errors);
  }

  if (validateObject(root.policy, "policy", errors)) {
    const pol = root.policy as Record<string, unknown>;
    validateBoolean(pol.enableProfilePolicy, "policy.enableProfilePolicy", errors);
    validateString(pol.policyFile, "policy.policyFile", errors, false);
  }

  if (validateObject(root.doctor, "doctor", errors)) {
    const doc = root.doctor as Record<string, unknown>;
    validateBoolean(doc.runAfterInstall, "doctor.runAfterInstall", errors);
    validateBoolean(doc.exportReport, "doctor.exportReport", errors);
  }

  return { ok: errors.length === 0, errors };
}
