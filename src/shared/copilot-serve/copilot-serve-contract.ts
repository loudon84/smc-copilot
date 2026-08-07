export type CopilotServeProcessStatus =
  | "missing"
  | "stopped"
  | "starting"
  | "running"
  | "degraded"
  | "error";

/** Public connection info — Device Token must NEVER be included (v9.0 PRD §5.2). */
export interface CopilotServeConnection {
  baseUrl: string;
  port: number;
}

export interface CopilotServeStatus {
  status: CopilotServeProcessStatus;
  pid: number | null;
  port: number;
  baseUrl: string;
  lastError: string | null;
  logPath: string;
}

export interface CopilotServeStatusChangeEvent {
  status: CopilotServeProcessStatus;
  pid: number | null;
  port: number;
  baseUrl: string;
  lastError: string | null;
  timestamp: string;
}

export type PreflightCheckStatus = "pass" | "fail" | "warn" | "skip";

export interface PreflightCheckItem {
  id: string;
  label: string;
  status: PreflightCheckStatus;
  detail: string | null;
}

export interface CopilotServePreflightResult {
  ready: boolean;
  installed: boolean;
  serveRoot: string | null;
  checks: PreflightCheckItem[];
}

export interface CopilotServeDeployOptions {
  force?: boolean;
  restartDesktop?: boolean;
}

export interface CopilotServeDeployResult {
  success: boolean;
  exitCode: number | null;
  log: string;
  error: string | null;
}

export interface CopilotServeDeployProgressEvent {
  line: string;
  stream: "stdout" | "stderr";
}

export interface CopilotServeAPI {
  getConnection: () => Promise<CopilotServeConnection | null>;
  getStatus: () => Promise<CopilotServeStatus>;
  start: () => Promise<CopilotServeStatus>;
  stop: () => Promise<CopilotServeStatus>;
  restart: () => Promise<CopilotServeStatus>;
  getLogs: (options?: { tailLines?: number }) => Promise<string>;
  precheck: () => Promise<CopilotServePreflightResult>;
  deploy: (options?: CopilotServeDeployOptions) => Promise<CopilotServeDeployResult>;
  openRuntimeDir: () => Promise<{ ok: boolean; path: string | null }>;
  onStatusChanged: (
    callback: (event: CopilotServeStatusChangeEvent) => void,
  ) => () => void;
  onDeployProgress: (
    callback: (event: CopilotServeDeployProgressEvent) => void,
  ) => () => void;
}
