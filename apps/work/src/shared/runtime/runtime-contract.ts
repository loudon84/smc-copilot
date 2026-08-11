/**
 * Shared Hermes Runtime connection contract for Copilot Desktop.
 * Renderer and main process must use these types for Runtime IPC.
 */

export type HermesRuntimeState =
  | "ready"
  | "runtime_missing"
  | "runtime_invalid"
  | "gateway_stopped"
  | "gateway_starting"
  | "gateway_unreachable"
  | "gateway_auth_failed"
  | "configuration_error";

export interface HermesRuntimeProbe {
  mode: "local";
  state: HermesRuntimeState;

  profile?: string;
  homePath?: string;
  executablePath?: string;
  endpoint: string;

  runtimeFound: boolean;
  cliAvailable: boolean;
  gatewayRunning: boolean;
  gatewayHealthy: boolean;
  authenticated: boolean;

  version?: string;
  errorCode?: string;
  errorMessage?: string;
  probedAt?: number;
}

export interface HermesRuntimeConnectionResult {
  ok: boolean;
  state: HermesRuntimeState;

  profile?: string;
  endpoint?: string;
  version?: string;

  errorCode?: string;
  errorMessage?: string;
}

export interface HermesRuntimeAdapter {
  probe(profile?: string): Promise<HermesRuntimeProbe>;

  ensureReady(profile?: string): Promise<HermesRuntimeConnectionResult>;

  getStatus(profile?: string): Promise<HermesRuntimeProbe>;

  restart(profile?: string): Promise<HermesRuntimeConnectionResult>;
}
