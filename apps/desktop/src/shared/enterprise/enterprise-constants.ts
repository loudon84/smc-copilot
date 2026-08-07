export type InstallStage =
  | "check-enterprise-install"
  | "load-deployment-config"
  | "acquire-install-lock"
  | "run-preflight"
  | "resolve-runtime-bundle"
  | "verify-bundle-checksum"
  | "install-runtime-tools"
  | "install-hermes-agent-source"
  | "create-or-reuse-shared-venv"
  | "install-python-dependencies"
  | "provision-default-hermes-home"
  | "bootstrap-profile-runtime-db"
  | "bootstrap-profiles"
  | "install-bundled-skills"
  | "apply-policy"
  | "start-default-gateway"
  | "optional-start-auto-start-profiles"
  | "run-runtime-doctor"
  | "write-install-marker"
  | "open-workspaces";

export const INSTALL_STAGES: InstallStage[] = [
  "check-enterprise-install",
  "load-deployment-config",
  "acquire-install-lock",
  "run-preflight",
  "resolve-runtime-bundle",
  "verify-bundle-checksum",
  "install-runtime-tools",
  "install-hermes-agent-source",
  "create-or-reuse-shared-venv",
  "install-python-dependencies",
  "provision-default-hermes-home",
  "bootstrap-profile-runtime-db",
  "bootstrap-profiles",
  "install-bundled-skills",
  "apply-policy",
  "start-default-gateway",
  "optional-start-auto-start-profiles",
  "run-runtime-doctor",
  "write-install-marker",
  "open-workspaces",
];

export type PreflightSeverity = "P0" | "P1" | "P2";

export type PreflightStatus = "pass" | "fail" | "warn" | "info" | "unknown";

export type DoctorCheckStatus = "pass" | "fail" | "warn" | "error" | "skip";

export type RepairLevel = 1 | 2 | 3 | 4 | 5;

export type RollbackTarget =
  | "desktop-previous-version"
  | "agent-previous-version"
  | "runtime-bundle-previous-version"
  | "profile-runtime-db-backup"
  | "profile-config-backup";

export type InstallMode = "windows-native" | "wsl2";

export type InstallScope = "current-user" | "all-users";

export type BundleSourceType = "artifact" | "offline" | "embedded";

export type AgentSourceType = "release-zip" | "git-clone";

export type AgentAuthMode = "none" | "ssh-key" | "personal-access-token";

export type InstallPhase =
  | "install"
  | "update"
  | "repair"
  | "rollback";

export type EnterpriseInstallScreen =
  | "splash"
  | "check-install"
  | "load-deployment-config"
  | "preflight"
  | "runtime-bundle"
  | "install-agent"
  | "bootstrap-profiles"
  | "start-gateway"
  | "doctor"
  | "setup"
  | "main";

export const INSTALL_STAGE_WEIGHTS: Record<InstallStage, number> = {
  "check-enterprise-install": 2,
  "load-deployment-config": 3,
  "acquire-install-lock": 1,
  "run-preflight": 5,
  "resolve-runtime-bundle": 15,
  "verify-bundle-checksum": 3,
  "install-runtime-tools": 5,
  "install-hermes-agent-source": 10,
  "create-or-reuse-shared-venv": 8,
  "install-python-dependencies": 15,
  "provision-default-hermes-home": 2,
  "bootstrap-profile-runtime-db": 3,
  "bootstrap-profiles": 10,
  "install-bundled-skills": 3,
  "apply-policy": 2,
  "start-default-gateway": 5,
  "optional-start-auto-start-profiles": 3,
  "run-runtime-doctor": 3,
  "write-install-marker": 1,
  "open-workspaces": 0,
};

export type EnterpriseErrorCode =
  | "E_DEPLOY_SCHEMA_INVALID"
  | "E_DEPLOY_FILE_NOT_FOUND"
  | "E_DEPLOY_FILE_READ_FAILED"
  | "E_BUNDLE_DOWNLOAD_FAILED"
  | "E_BUNDLE_SHA256_MISMATCH"
  | "E_BUNDLE_SIGNATURE_INVALID"
  | "E_BUNDLE_DISK_FULL"
  | "E_BUNDLE_EXTRACT_FAILED"
  | "E_GIT_CLONE_FAILED"
  | "E_GIT_AUTH_FAILED"
  | "E_GIT_CHECKOUT_FAILED"
  | "E_AGENT_VERSION_MISMATCH"
  | "E_AGENT_SOURCE_NOT_FOUND"
  | "E_VENV_CREATE_FAILED"
  | "E_VENV_REUSED_BROKEN"
  | "E_PIP_INSTALL_FAILED"
  | "E_PIP_INDEX_UNREACHABLE"
  | "E_PORT_EXHAUSTED"
  | "E_PORT_CONFLICT"
  | "E_GATEWAY_STARTUP_TIMEOUT"
  | "E_GATEWAY_HEALTH_FAILED"
  | "E_INSTALL_LOCK_TIMEOUT"
  | "E_INSTALL_CANCELLED"
  | "E_PROFILE_DB_CREATE_FAILED"
  | "E_PROFILE_BOOTSTRAP_FAILED"
  | "E_PROFILE_HOME_NOT_WRITABLE"
  | "E_POLICY_APPLY_FAILED"
  | "E_DOCTOR_CHECK_FAILED"
  | "E_ROLLBACK_CHECKSUM_MISMATCH"
  | "E_ROLLBACK_SNAPSHOT_NOT_FOUND"
  | "E_REPAIR_FAILED"
  | "E_DIR_PERMISSION_FAILED"
  | "WIN_POWERSHELL_BLOCKED"
  | "WIN_LONG_PATH_DISABLED"
  | "HERMES_CMD_NOT_FOUND"
  | "HERMES_INSTALL_INCOMPLETE"
  | "HERMES_VERSION_MISMATCH"
  | "UV_INSTALL_FAILED"
  | "PYTHON_VENV_MISSING"
  | "NODE_VERSION_CONFLICT"
  | "PLAYWRIGHT_CHROMIUM_MISSING"
  | "API_SERVER_DISABLED"
  | "API_SERVER_UNAUTHORIZED"
  | "PROFILE_PORT_CONFLICT"
  | "GATEWAY_START_TIMEOUT"
  | "GATEWAY_CRASHED";

export const ENTERPRISE_ERROR_MESSAGES: Record<EnterpriseErrorCode, string> = {
  E_DEPLOY_SCHEMA_INVALID: "deployment.json schema 校验失败",
  E_DEPLOY_FILE_NOT_FOUND: "deployment.json 文件不存在",
  E_DEPLOY_FILE_READ_FAILED: "deployment.json 读取失败",
  E_BUNDLE_DOWNLOAD_FAILED: "Runtime Bundle 下载失败",
  E_BUNDLE_SHA256_MISMATCH: "Runtime Bundle SHA-256 校验不匹配",
  E_BUNDLE_SIGNATURE_INVALID: "Runtime Bundle 签名校验失败",
  E_BUNDLE_DISK_FULL: "磁盘空间不足",
  E_BUNDLE_EXTRACT_FAILED: "Runtime Bundle 解压失败",
  E_GIT_CLONE_FAILED: "Git clone 失败",
  E_GIT_AUTH_FAILED: "Git 认证失败",
  E_GIT_CHECKOUT_FAILED: "Git checkout 失败",
  E_AGENT_VERSION_MISMATCH: "Hermes Agent 版本不匹配",
  E_AGENT_SOURCE_NOT_FOUND: "Hermes Agent 源码不存在",
  E_VENV_CREATE_FAILED: "Python venv 创建失败",
  E_VENV_REUSED_BROKEN: "复用的 Python venv 已损坏",
  E_PIP_INSTALL_FAILED: "pip 依赖安装失败",
  E_PIP_INDEX_UNREACHABLE: "PyPI 索引不可达",
  E_PORT_EXHAUSTED: "可用端口耗尽",
  E_PORT_CONFLICT: "端口冲突",
  E_GATEWAY_STARTUP_TIMEOUT: "Gateway 启动超时",
  E_GATEWAY_HEALTH_FAILED: "Gateway 健康检查失败",
  E_INSTALL_LOCK_TIMEOUT: "安装锁获取超时",
  E_INSTALL_CANCELLED: "安装已取消",
  E_PROFILE_DB_CREATE_FAILED: "Profile Runtime DB 创建失败",
  E_PROFILE_BOOTSTRAP_FAILED: "Profile 引导失败",
  E_PROFILE_HOME_NOT_WRITABLE: "Profile 目录不可写",
  E_POLICY_APPLY_FAILED: "Policy 应用失败",
  E_DOCTOR_CHECK_FAILED: "Doctor 检查失败",
  E_ROLLBACK_CHECKSUM_MISMATCH: "回滚快照校验不匹配",
  E_ROLLBACK_SNAPSHOT_NOT_FOUND: "回滚快照不存在",
  E_REPAIR_FAILED: "修复失败",
  E_DIR_PERMISSION_FAILED: "目录权限不足",
  WIN_POWERSHELL_BLOCKED: "PowerShell 执行策略阻止脚本运行",
  WIN_LONG_PATH_DISABLED: "Windows 长路径支持未启用",
  HERMES_CMD_NOT_FOUND: "hermes 命令未找到",
  HERMES_INSTALL_INCOMPLETE: "Hermes Agent 安装不完整",
  HERMES_VERSION_MISMATCH: "Hermes Agent 版本不匹配",
  UV_INSTALL_FAILED: "uv 安装失败",
  PYTHON_VENV_MISSING: "Python venv 不存在",
  NODE_VERSION_CONFLICT: "Node.js 版本冲突",
  PLAYWRIGHT_CHROMIUM_MISSING: "Playwright Chromium 未安装",
  API_SERVER_DISABLED: "API Server 未启用",
  API_SERVER_UNAUTHORIZED: "API Server 认证失败",
  PROFILE_PORT_CONFLICT: "Profile 端口冲突",
  GATEWAY_START_TIMEOUT: "Gateway 启动超时",
  GATEWAY_CRASHED: "Gateway 已崩溃",
};

export const DEFAULT_PROFILE_NAMES = [
  "default",
  "writer",
  "coding",
  "research",
  "recruiters",
  "finance",
  "agenter",
] as const;

export type ProfileName = (typeof DEFAULT_PROFILE_NAMES)[number];

export const DEFAULT_PROFILE_PORTS: Record<ProfileName, number> = {
  default: 8642,
  writer: 8652,
  coding: 8662,
  research: 8672,
  recruiters: 8682,
  finance: 8692,
  agenter: 8702,
};
