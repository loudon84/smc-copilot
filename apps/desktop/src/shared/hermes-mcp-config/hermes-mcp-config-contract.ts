/** Hermes Agent MCP Host Mode — hermes-agent mcp_servers config contract (v7.6). */

export type HermesMcpServerStatus = "enabled" | "disabled" | "misconfigured" | "unknown";

export type HermesMcpServerView = {
  name: string;
  enabled: boolean;
  url: string;
  urlEnvKey?: string;
  tokenConfigured: boolean;
  tokenEnvKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
  toolsInclude?: string[];
  status: HermesMcpServerStatus;
  lastError?: string;
};

export type SaveHermesMcpServerInput = {
  name: string;
  enabled?: boolean;
  url?: string;
  urlEnvKey?: string;
  token?: string;
  tokenEnvKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
  toolsInclude?: string[];
  profile?: string;
};

export type HermesMcpServerMutationResult = {
  ok: boolean;
  server?: HermesMcpServerView;
  restarted?: boolean;
  errorCode?: string;
  message?: string;
};

export type HermesMcpTestServerResult = {
  ok: boolean;
  gatewayHealthy?: boolean;
  serverRegistered?: boolean;
  message?: string;
  errorCode?: string;
};

export type HermesMcpListToolsResult = {
  ok: boolean;
  tools: string[];
  source: "config" | "hermes-agent";
  message?: string;
};

export interface HermesMcpConfigAPI {
  getServers: (profile?: string) => Promise<HermesMcpServerView[]>;
  saveServer: (input: SaveHermesMcpServerInput) => Promise<HermesMcpServerMutationResult>;
  removeServer: (name: string, profile?: string) => Promise<HermesMcpServerMutationResult>;
  enableServer: (name: string, profile?: string) => Promise<HermesMcpServerMutationResult>;
  disableServer: (name: string, profile?: string) => Promise<HermesMcpServerMutationResult>;
  testServer: (name: string, profile?: string) => Promise<HermesMcpTestServerResult>;
  reload: (profile?: string) => Promise<{ ok: boolean; restarted?: boolean; message?: string }>;
  listTools: (name: string, profile?: string) => Promise<HermesMcpListToolsResult>;
}
