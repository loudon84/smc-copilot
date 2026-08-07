/** Diagnostics view models exposed over IPC (no secrets). */

export interface ServeDiagnosticsEnvironment {
  runtimeVersion: string | null;
  apiVersion: string | null;
  platform: string | null;
  hermesInstalled: boolean | null;
  checks: Record<string, string>;
}

export interface ServeDiagnosticsLogsResult {
  lines: string[];
  truncated: boolean;
}

export interface ServeDiagnosticsBundleMeta {
  ok: boolean;
  message: string | null;
  /** Opaque id or path hint — never contain device token. */
  bundleRef: string | null;
}
