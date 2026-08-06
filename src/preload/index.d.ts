import { ElectronAPI } from "@electron-toolkit/preload";
import type { AppLocale } from "../shared/i18n/types";
import type { AiosBrowserAPI } from "./browser-api";
import type { ProfileRuntimeAPI, ProfileEntryAPI } from "../shared/profile-runtime/profile-runtime-contract";
import type { ProfileRoleAPI } from "../shared/profile-roles/profile-role-contract";
import type { InstallerPrecheck } from "../shared/enterprise/enterprise-contract";
import type { RuntimeState } from "../shared/enterprise/runtime-state-contract";
import type { AiOsAPI, AiOsRuntimeSnapshot } from "../shared/aios/aios-contract";
import type { CopilotServeAPI } from "../shared/copilot-serve/copilot-serve-contract";
import type { HermesMcpAPI } from "../shared/mcp/mcp-contract";
import type { McpSkillGatewayRuntimeAPI } from "../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import type { GeneHubRuntimeAPI } from "../shared/genehub/genehub-contract";

interface InstallStatus {
  installed: boolean;
  configured: boolean;
  hasApiKey: boolean;
  verified: boolean;
}

interface InstallProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

interface HermesAPI {
  // Installation
  checkInstall: () => Promise<InstallStatus>;
  checkInstallStatus: () => Promise<InstallStatus>;
  verifyInstall: () => Promise<boolean>;
  startInstall: () => Promise<{ success: boolean; error?: string }>;
  startInstallWithSource: (
    sourceConfig: unknown,
    options?: { force?: boolean },
  ) => Promise<{ success: boolean; error?: string }>;
  getRuntimeState: () => Promise<RuntimeState>;
  showOpenDialog: (
    opts: Electron.OpenDialogOptions,
  ) => Promise<Electron.OpenDialogReturnValue>;
  onInstallProgress: (
    callback: (progress: InstallProgress) => void,
  ) => () => void;

  // Hermes engine info
  getHermesVersion: () => Promise<string | null>;
  refreshHermesVersion: () => Promise<string | null>;
  runHermesDoctor: () => Promise<string>;
  runHermesUpdate: () => Promise<{ success: boolean; error?: string }>;

  // OpenClaw migration
  checkOpenClaw: () => Promise<{ found: boolean; path: string | null }>;
  runClawMigrate: () => Promise<{ success: boolean; error?: string }>;

  getLocale: () => Promise<AppLocale>;
  setLocale: (locale: AppLocale) => Promise<AppLocale>;

  // Configuration (profile-aware)
  getEnv: (profile?: string) => Promise<Record<string, string>>;
  setEnv: (key: string, value: string, profile?: string) => Promise<boolean>;
  getConfig: (key: string, profile?: string) => Promise<string | null>;
  setConfig: (key: string, value: string, profile?: string) => Promise<boolean>;
  getHermesHome: (profile?: string) => Promise<string>;
  getModelConfig: (
    profile?: string,
  ) => Promise<{ provider: string; model: string; baseUrl: string }>;
  setModelConfig: (
    provider: string,
    model: string,
    baseUrl: string,
    profile?: string,
  ) => Promise<boolean>;

  // Connection mode (local / remote / ssh)
  isRemoteMode: () => Promise<boolean>;
  isRemoteOnlyMode: () => Promise<boolean>;
  getConnectionConfig: () => Promise<{
    mode: "local" | "remote" | "ssh";
    remoteUrl: string;
    hasApiKey: boolean;
    apiKeyLength: number;
    ssh: {
      host: string;
      port: number;
      username: string;
      keyPath: string;
      remotePort: number;
      localPort: number;
    };
  }>;
  setConnectionConfig: (
    mode: "local" | "remote" | "ssh",
    remoteUrl: string,
    apiKey?: string,
  ) => Promise<boolean>;
  setSshConfig: (
    host: string,
    port: number,
    username: string,
    keyPath: string,
    remotePort: number,
    localPort: number,
  ) => Promise<boolean>;
  testRemoteConnection: (url: string, apiKey?: string) => Promise<boolean>;
  testSshConnection: (
    host: string,
    port: number,
    username: string,
    keyPath: string,
    remotePort: number,
  ) => Promise<boolean>;
  isSshTunnelActive: () => Promise<boolean>;
  startSshTunnel: () => Promise<boolean>;
  stopSshTunnel: () => Promise<boolean>;

  // Chat
  sendMessage: (
    message: string,
    profile?: string,
    resumeSessionId?: string,
    history?: Array<{ role: string; content: string }>,
  ) => Promise<{ response: string; sessionId?: string }>;
  abortChat: () => Promise<void>;
  onChatChunk: (callback: (chunk: string) => void) => () => void;
  onChatDone: (callback: (sessionId?: string) => void) => () => void;
  onChatToolProgress: (callback: (tool: string) => void) => () => void;
  onChatUsage: (
    callback: (usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost?: number;
      rateLimitRemaining?: number;
      rateLimitReset?: number;
    }) => void,
  ) => () => void;
  onChatError: (callback: (error: string) => void) => () => void;

  // Gateway
  startGateway: () => Promise<boolean>;
  stopGateway: () => Promise<boolean>;
  gatewayStatus: () => Promise<boolean>;
  getAiOsRuntimeSnapshot: () => Promise<AiOsRuntimeSnapshot>;

  // Platform toggles
  getPlatformEnabled: (profile?: string) => Promise<Record<string, boolean>>;
  setPlatformEnabled: (
    platform: string,
    enabled: boolean,
    profile?: string,
  ) => Promise<boolean>;

  // Sessions
  listSessions: (
    limit?: number,
    offset?: number,
  ) => Promise<
    Array<{
      id: string;
      source: string;
      startedAt: number;
      endedAt: number | null;
      messageCount: number;
      model: string;
      title: string | null;
      preview: string;
    }>
  >;
  getSessionMessages: (sessionId: string) => Promise<
    Array<{
      id: number;
      role: "user" | "assistant";
      content: string;
      timestamp: number;
    }>
  >;

  // Profiles
  listProfiles: () => Promise<
    Array<{
      name: string;
      path: string;
      isDefault: boolean;
      isActive: boolean;
      model: string;
      provider: string;
      hasEnv: boolean;
      hasSoul: boolean;
      skillCount: number;
      gatewayRunning: boolean;
    }>
  >;
  createProfile: (
    name: string,
    clone: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteProfile: (
    name: string,
  ) => Promise<{ success: boolean; error?: string }>;
  setActiveProfile: (name: string) => Promise<boolean>;

  // Memory
  readMemory: (profile?: string) => Promise<{
    memory: { content: string; exists: boolean; lastModified: number | null };
    user: { content: string; exists: boolean; lastModified: number | null };
    stats: { totalSessions: number; totalMessages: number };
  }>;

  addMemoryEntry: (
    content: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  writeMemoryContent: (
    content: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  updateMemoryEntry: (
    index: number,
    content: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  removeMemoryEntry: (index: number, profile?: string) => Promise<boolean>;
  writeUserProfile: (
    content: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;

  // Soul
  readSoul: (profile?: string) => Promise<string>;
  writeSoul: (content: string, profile?: string) => Promise<boolean>;
  resetSoul: (profile?: string) => Promise<string>;

  // Tools
  getToolsets: (
    profile?: string,
  ) => Promise<
    Array<{ key: string; label: string; description: string; enabled: boolean }>
  >;
  setToolsetEnabled: (
    key: string,
    enabled: boolean,
    profile?: string,
  ) => Promise<boolean>;

  // Skills
  listInstalledSkills: (
    profile?: string,
  ) => Promise<
    Array<{ name: string; category: string; description: string; path: string }>
  >;
  listBundledSkills: () => Promise<
    Array<{
      name: string;
      description: string;
      category: string;
      source: string;
      installed: boolean;
    }>
  >;
  getSkillContent: (skillPath: string) => Promise<string>;
  installSkill: (
    identifier: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  uninstallSkill: (
    name: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;

  // Session cache
  listCachedSessions: (
    limit?: number,
    offset?: number,
  ) => Promise<
    Array<{
      id: string;
      title: string;
      startedAt: number;
      source: string;
      messageCount: number;
      model: string;
    }>
  >;
  syncSessionCache: () => Promise<
    Array<{
      id: string;
      title: string;
      startedAt: number;
      source: string;
      messageCount: number;
      model: string;
    }>
  >;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;

  // Session search
  searchSessions: (
    query: string,
    limit?: number,
  ) => Promise<
    Array<{
      sessionId: string;
      title: string | null;
      startedAt: number;
      source: string;
      messageCount: number;
      model: string;
      snippet: string;
    }>
  >;

  // Credential Pool
  getCredentialPool: () => Promise<
    Record<string, Array<{ key: string; label: string }>>
  >;
  setCredentialPool: (
    provider: string,
    entries: Array<{ key: string; label: string }>,
  ) => Promise<boolean>;

  // Models
  listModels: () => Promise<
    Array<{
      id: string;
      name: string;
      provider: string;
      model: string;
      baseUrl: string;
      createdAt: number;
    }>
  >;
  addModel: (
    name: string,
    provider: string,
    model: string,
    baseUrl: string,
    opts?: { apiKeyEnv?: string; apiKeyLiteral?: string },
  ) => Promise<{
    id: string;
    name: string;
    provider: string;
    model: string;
    baseUrl: string;
    apiKeyEnv?: string;
    apiKeyLiteral?: string;
    createdAt: number;
    updatedAt?: number;
  }>;
  removeModel: (id: string) => Promise<boolean>;
  updateModel: (id: string, fields: Record<string, string>) => Promise<boolean>;

  // Claw3D
  claw3dStatus: () => Promise<{
    cloned: boolean;
    installed: boolean;
    devServerRunning: boolean;
    adapterRunning: boolean;
    port: number;
    portInUse: boolean;
    wsUrl: string;
    running: boolean;
    error: string;
  }>;
  claw3dSetup: () => Promise<{ success: boolean; error?: string }>;
  onClaw3dSetupProgress: (
    callback: (progress: {
      step: number;
      totalSteps: number;
      title: string;
      detail: string;
      log: string;
    }) => void,
  ) => () => void;
  claw3dGetPort: () => Promise<number>;
  claw3dSetPort: (port: number) => Promise<boolean>;
  claw3dGetWsUrl: () => Promise<string>;
  claw3dSetWsUrl: (url: string) => Promise<boolean>;
  claw3dStartAll: () => Promise<{ success: boolean; error?: string }>;
  claw3dStopAll: () => Promise<boolean>;
  claw3dGetLogs: () => Promise<string>;
  claw3dStartDev: () => Promise<boolean>;
  claw3dStopDev: () => Promise<boolean>;
  claw3dStartAdapter: () => Promise<boolean>;
  claw3dStopAdapter: () => Promise<boolean>;

  // Updates
  checkForUpdates: () => Promise<string | null>;
  downloadUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes: string }) => void,
  ) => () => void;
  onUpdateDownloadProgress: (
    callback: (info: { percent: number }) => void,
  ) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onUpdateError: (callback: (message: string) => void) => () => void;

  // Runtime setup / enterprise
  runDoctor: () => Promise<import("../shared/enterprise/enterprise-schema").DoctorReport>;
  runRepair: (errorCode?: string) => Promise<import("../shared/enterprise/enterprise-contract").EnterpriseRepairResult>;
  reinstallRuntime: () => Promise<import("../shared/enterprise/enterprise-contract").EnterpriseInstallResult>;
  enterpriseGetDeploymentConfig: () => Promise<import("../shared/enterprise/enterprise-schema").LoadConfigResult>;
  enterpriseValidateConfig: () => Promise<import("../shared/enterprise/enterprise-schema").ValidationResult>;
  enterprisePreflight: () => Promise<import("../shared/enterprise/enterprise-schema").PreflightReport>;
  enterpriseInstall: (
    input?: import("../shared/enterprise/enterprise-contract").EnterpriseInstallInput,
  ) => Promise<import("../shared/enterprise/enterprise-contract").EnterpriseInstallResult>;
  enterpriseInstallCancel: () => Promise<{ ok: boolean }>;
  enterpriseUpdate: (
    input?: import("../shared/enterprise/enterprise-contract").EnterpriseUpdateInput,
  ) => Promise<import("../shared/enterprise/enterprise-contract").EnterpriseUpdateResult>;
  enterpriseRepair: (
    input?: import("../shared/enterprise/enterprise-contract").EnterpriseRepairInput,
  ) => Promise<import("../shared/enterprise/enterprise-contract").EnterpriseRepairResult>;
  enterpriseRollback: (
    input: import("../shared/enterprise/enterprise-contract").EnterpriseRollbackInput,
  ) => Promise<import("../shared/enterprise/enterprise-contract").EnterpriseRollbackResult>;
  enterpriseGetInstallMarker: () => Promise<import("../shared/enterprise/enterprise-schema").InstallMarker | null>;
  enterpriseGetInstallLog: (input: {
    type: import("../shared/enterprise/enterprise-constants").InstallPhase;
  }) => Promise<string>;
  enterpriseOpenLogDir: () => Promise<{ ok: boolean }>;
  enterpriseRunDoctor: () => Promise<import("../shared/enterprise/enterprise-schema").DoctorReport>;
  enterpriseExportDoctorReport: () => Promise<{ ok: boolean; path: string }>;
  enterpriseGetMigrationStatus: () => Promise<import("../shared/enterprise/migration-contract").MigrationStatus>;
  onEnterpriseInstallProgress: (
    callback: (progress: import("../shared/enterprise/enterprise-schema").InstallProgressEvent) => void,
  ) => () => void;

  // Menu events
  onMenuNewChat: (callback: () => void) => () => void;
  onMenuSearchSessions: (callback: () => void) => () => void;

  // Cron Jobs
  listCronJobs: (
    includeDisabled?: boolean,
    profile?: string,
  ) => Promise<
    Array<{
      id: string;
      name: string;
      schedule: string;
      prompt: string;
      state: "active" | "paused" | "completed";
      enabled: boolean;
      next_run_at: string | null;
      last_run_at: string | null;
      last_status: string | null;
      last_error: string | null;
      repeat: { times: number | null; completed: number } | null;
      deliver: string[];
      skills: string[];
      script: string | null;
    }>
  >;
  createCronJob: (
    schedule: string,
    prompt?: string,
    name?: string,
    deliver?: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  removeCronJob: (
    jobId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  pauseCronJob: (
    jobId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  resumeCronJob: (
    jobId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  triggerCronJob: (
    jobId: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;

  // Shell
  openExternal: (url: string) => Promise<void>;

  // Backup / Import
  runHermesBackup: (
    profile?: string,
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  runHermesImport: (
    archivePath: string,
    profile?: string,
  ) => Promise<{ success: boolean; error?: string }>;

  // Debug dump
  runHermesDump: () => Promise<string>;

  // Memory providers
  discoverMemoryProviders: (profile?: string) => Promise<
    Array<{
      name: string;
      description: string;
      installed: boolean;
      active: boolean;
      envVars: string[];
    }>
  >;

  // MCP servers
  listMcpServers: (
    profile?: string,
  ) => Promise<
    Array<{ name: string; type: string; enabled: boolean; detail: string }>
  >;

  // Log viewer
  readLogs: (
    logFile?: string,
    lines?: number,
  ) => Promise<{ content: string; path: string }>;

  // First Run Wizard
  firstRunWizardDetectAgent: () => Promise<{
    stage: string;
    agentInstalled: boolean;
    agentPath?: string;
  }>;

  firstRunWizardStartInstall: (sourceConfig: unknown) => Promise<{
    success: boolean;
    agentPath?: string;
    error?: string;
  }>;

  firstRunWizardCancelInstall: () => Promise<boolean>;

  firstRunWizardSelectZipFile: () => Promise<Electron.OpenDialogReturnValue>;

  onFirstRunWizardProgress: (
    callback: (progress: { stage: string; message: string }) => void,
  ) => () => void;

  onFirstRunWizardStateChange: (
    callback: (state: unknown) => void,
  ) => () => void;

  getInstallerPrecheck: () => Promise<InstallerPrecheck | null>;

  mcp: HermesMcpAPI;

  windowControls: WindowControlsAPI;

  // Dropdown IPC（桥接到 React 层）
  onDropdownShow: (
    callback: (event: {
      key: string;
      anchorBounds: { x: number; y: number; width: number; height: number };
      preferredDirection: string;
      data?: unknown;
    }) => void,
  ) => () => void;
  onDropdownClose: (
    callback: (event: { key: string }) => void,
  ) => () => void;
  onDropdownCloseAll: (callback: () => void) => () => void;

  // File attachments
  getPathForFile: (file: File) => string;
  stageAttachment: (
    sessionId: string,
    filename: string,
    base64: string,
  ) => Promise<string>;
  clearStagedAttachments: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

interface WindowControlsAPI {
  minimize(): Promise<void>;
  maximizeOrRestore(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
}

/**
 * Shell API - 桌面壳层基础能力
 */
interface SmcShellAPI {
  /**
   * 解析启动决策
   */
  resolveStartupDecision: () => Promise<import("../shared/startup/startup-contract").StartupDecision>;

  /**
   * 获取应用版本
   */
  getAppVersion: () => Promise<string>;

  /**
   * 窗口控制
   */
  windowControls: WindowControlsAPI;

  /**
   * 打开外部链接
   */
  openExternal: (url: string) => Promise<void>;

  /**
   * 退出应用（绕过「关闭到托盘」）
   */
  quitApp: () => Promise<void>;
}

interface ShellViewBoundsIPC {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShellViewSnapshot {
  id: string;
  kind: string;
  layer: string;
  state: string;
  active: boolean;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  bounds: ShellViewBoundsIPC;
  errorCode?: number;
  errorDescription?: string;
  crashed?: boolean;
  crashedReason?: string;
  crashedExitCode?: number;
  updatedAt: number;
}

interface ShellViewMetadataChangedEvent {
  snapshot: ShellViewSnapshot;
}

interface ShellViewLoadFailedEvent {
  id: string;
  url: string;
  errorCode: number;
  errorDescription: string;
}

interface ShellViewCrashedEvent {
  id: string;
  reason: string;
  exitCode: number;
}

interface ShellViewAPI {
  create: (
    layerId: string,
    kind: string,
    url: string,
    options?: Record<string, unknown>,
  ) => Promise<void>;
  activate: (layerId: string) => Promise<void>;
  setBounds: (layerId: string, bounds: ShellViewBoundsIPC) => Promise<void>;
  loadUrl: (layerId: string, url: string) => Promise<void>;
  focus: (layerId: string) => Promise<void>;
  hide: (layerId: string) => Promise<void>;
  destroy: (layerId: string) => Promise<void>;
  reload: (layerId: string) => Promise<void>;
  stopLoading: (layerId: string) => Promise<void>;
  goBack: (layerId: string) => Promise<void>;
  goForward: (layerId: string) => Promise<void>;
  recover: (layerId: string) => Promise<void>;
  getState: (layerId: string) => Promise<ShellViewSnapshot | null>;
  getAll: () => Promise<ShellViewSnapshot[]>;
  onMetadataChanged: (
    callback: (event: ShellViewMetadataChangedEvent) => void,
  ) => () => void;
  onLoadFailed: (callback: (event: ShellViewLoadFailedEvent) => void) => () => void;
  onCrashed: (callback: (event: ShellViewCrashedEvent) => void) => () => void;
}

type MainPagePersistedState =
  import("../shared/shell/main-page-state-contract").MainPagePersistedState;

interface MainPageStateAPI {
  read: () => Promise<MainPagePersistedState>;
  write: (state: MainPagePersistedState) => Promise<void>;
}

interface WorkspacesAPI {
  listFiles: (
    profileId: string,
    relativePath?: string,
  ) => Promise<
    Array<{ name: string; path: string; isDirectory: boolean; size?: number }>
  >;
  readFile: (
    profileId: string,
    relativePath: string,
  ) => Promise<
    | { ok: true; content: string; encoding: "utf8" | "base64"; path: string; size: number }
    | { ok: false; error: string }
  >;
  gitStatus: (profileId: string) => Promise<{ branch: string | null; dirtyCount: number }>;
}

type WorkspaceChatAPI = typeof import("./workspace-chat-api").workspaceChatApi;
type HermesDefaultChatAPI = typeof import("./hermes-default-chat-api").hermesDefaultChatApi;
type ChatRuntimeAPI = typeof import("./chat-runtime-api").chatRuntimeApi;
type ChatFilesAPI = typeof import("./chat-files-api").chatFilesApi;
type ChatWorkspaceAPI = typeof import("./chat-workspace-api").chatWorkspaceApi;
type SessionCatalogAPI = typeof import("./session-catalog-api").sessionCatalogApi;
type WebOperatorTaskSessionAPI =
  import("../shared/web-operator/web-operator-task-session-contract").WebOperatorTaskSessionAPI;

declare global {
  interface Window {
    electron: ElectronAPI;
    workspaces: WorkspacesAPI;
    workspaceChat: WorkspaceChatAPI;
    hermesDefaultChat: HermesDefaultChatAPI;
    chatRuntime: ChatRuntimeAPI;
    chatFiles: ChatFilesAPI;
    chatWorkspace: ChatWorkspaceAPI;
    sessionCatalog: SessionCatalogAPI;
    webOperatorTaskSession: WebOperatorTaskSessionAPI;
    hermesAPI: HermesAPI;
    aiosBrowser: AiosBrowserAPI;
    profileRuntime: ProfileRuntimeAPI;
    profileRole: ProfileRoleAPI;
    profileEntry: ProfileEntryAPI;
    aiosRuntime: AiOsAPI;
    /** @deprecated V1.9 使用 window.shellView 代替 */
    smcShell: SmcShellAPI;
    shellView: ShellViewAPI;
    mainPageState: MainPageStateAPI;
    desktopAuth: import("../shared/auth/auth-contract").DesktopAuthAPI;
    desktopUserConfig: import("../shared/user-config/user-config-contract").UserConfigAPI;
    copilotServe: CopilotServeAPI;
    mcpSkillGatewayRuntime: McpSkillGatewayRuntimeAPI;
    genehubRuntime: GeneHubRuntimeAPI;
    hermesExperts: import("../shared/hermes-experts/hermes-experts-contract").HermesExpertsAPI;
    hermesMcpConfig: import("../shared/hermes-mcp-config/hermes-mcp-config-contract").HermesMcpConfigAPI;
    work: {
      task: {
        start: (
          input: import("../shared/work/work-task-contract").WorkTaskStartInput & {
            task: import("../shared/work/work-task-contract").WorkTask;
          },
        ) => Promise<import("../shared/work/work-task-contract").WorkTaskStartResult>;
        resume: (
          taskId: string,
          profile?: string,
        ) => Promise<import("../shared/work/work-task-contract").WorkTaskResumeResult>;
        list: (profile?: string) => Promise<import("../shared/work/work-task-contract").WorkTask[]>;
        getBySession: (
          sessionId: string,
          profile?: string,
        ) => Promise<import("../shared/work/work-task-contract").WorkTask | null>;
        send: (input: import("../shared/work/work-task-contract").WorkTaskSendInput) => Promise<import("../shared/work/work-task-contract").WorkTaskSendResult>;
        stop: (taskId: string) => Promise<void>;
        onEvent: (callback: (event: import("../shared/work/work-event-contract").WorkTaskEvent) => void) => () => void;
      };
    };
    internalView?: import("../shared/shell/overlay-contract").InternalViewAPI;
  }

  // Phase 5: Tray - add isQuitting flag to App
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}
