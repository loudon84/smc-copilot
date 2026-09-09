/**
 * Shared Hermes Runtime connection contract for Copilot Desktop.
 * Renderer and main process must use these types for Runtime IPC.
 */

export type HermesRuntimeState =
  | "ready"
  | "runtime_missing"
  | "runtime_invalid"
  /** Frozen Runtime Service adapter only. Managed probeLocal never emits this. */
  | "gateway_stopped"
  | "gateway_unreachable"
  | "gateway_auth_failed"
  | "configuration_error"
  | "conflict";

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
  /** True only after Windows listen inspect succeeded and matched the managed CLI. */
  runtimeContextVerified?: boolean;
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
