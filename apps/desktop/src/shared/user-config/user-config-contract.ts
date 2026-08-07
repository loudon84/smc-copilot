export interface DesktopBootstrapConfig {
  schemaVersion: 2;
  configVersion: string;
  configHash: string;
  user: {
    userId: string;
    username: string;
    displayName: string;
    tenantId: string;
    tenantName?: string;
  };
  features: {
    aiosHome: boolean;
    aiosWorkspace: boolean;
    webOperator: boolean;
    office: boolean;
    hermesRuntimeDrawer: boolean;
  };
  hermes: {
    activeProfile: string;
    installSource?: {
      type: "git" | "zip" | "bundled";
      url?: string;
      branch?: string;
      localPath?: string;
    };
    connection: {
      mode: "local" | "remote" | "ssh";
      remoteUrl?: string;
      apiKeyRef?: string;
      ssh?: {
        host: string;
        port: number;
        username: string;
        keyPath?: string;
        remotePort: number;
        localPort: number;
      };
    };
    profiles: Array<{
      name: string;
      enabled: boolean;
      soul?: string;
      user?: string;
      memory?: string;
      env?: Record<string, string>;
      config?: Record<string, unknown>;
    }>;
    models: Array<{
      name: string;
      provider: string;
      model: string;
      baseUrl: string;
      apiKeyRef?: string;
    }>;
    toolsets?: Record<string, boolean>;
    platforms?: Record<string, boolean>;
  };
  aios: {
    backendUrl: string;
    authPrefix: string;
    aiosHomeUrl: string;
    /** @deprecated Use aiosHomeUrl — kept for backward compatibility */
    frontendUrl?: string;
    workspacePath?: string;
    autoStart: boolean;
    env?: Record<string, string>;
    source?: {
      type: "git" | "zip" | "bundled";
      url?: string;
      branch?: string;
      localPath?: string;
    };
  };
}

export interface BootstrapState {
  initialized: boolean;
  lastConfigHash: string | null;
  lastConfigVersion: string | null;
  lastAppliedAt: string | null;
}

export interface ConfigDiffItem {
  path: string;
  type: "added" | "removed" | "changed";
  localValue: unknown;
  remoteValue: unknown;
  sensitive?: boolean;
}

export interface BootstrapResult {
  ok: boolean;
  firstLogin: boolean;
  applied: boolean;
  config: DesktopBootstrapConfig;
  diff?: ConfigDiffItem[];
  confirmToken?: string;
}

export interface UserConfigAPI {
  getLocalConfig(): Promise<DesktopBootstrapConfig | null>;
  fetchRemoteConfig(): Promise<DesktopBootstrapConfig>;
  bootstrap(): Promise<BootstrapResult>;
  diffRemoteConfig(): Promise<ConfigDiffItem[]>;
  applyRemoteConfig(confirmToken?: string): Promise<BootstrapResult>;
  getBootstrapState(): Promise<BootstrapState>;
}
