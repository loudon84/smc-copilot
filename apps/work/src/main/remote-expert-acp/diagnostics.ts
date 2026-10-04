import { createHash } from "crypto";

const SECRET_RE =
  /(?:authorization\s*:\s*bearer\s+\S+|access_token|refresh_token|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/gi;
const PATH_RE = /([A-Z]:\\Users\\(?!Public\\)[^\s"']+|\/Users\/(?!Shared)[^\s"']+|\/home\/[^\s"']+)/gi;

export function hashIdentity(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

export function redactDiagnosticsText(text: string): string {
  return text.replace(SECRET_RE, "[redacted]").replace(PATH_RE, "[path]");
}

export interface RemoteExpertDiagnosticEvent {
  name: string;
  timestamp: string;
  app_version?: string;
  contract_version?: string;
  trace_id: string;
  session_hash?: string;
  acp_session_hash?: string;
  turn_id?: string;
  error_code?: string;
  duration_ms?: number;
}

const events: RemoteExpertDiagnosticEvent[] = [];

export function emitRemoteExpertDiagnostic(
  event: Omit<RemoteExpertDiagnosticEvent, "timestamp"> & { timestamp?: string },
): void {
  const record: RemoteExpertDiagnosticEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  events.push(record);
  console.info("[remote-expert]", record.name, {
    trace_id: record.trace_id,
    session_hash: record.session_hash,
    error_code: record.error_code,
    duration_ms: record.duration_ms,
  });
}

export function listRemoteExpertDiagnostics(): RemoteExpertDiagnosticEvent[] {
  return [...events];
}

export function resetRemoteExpertDiagnostics(): void {
  events.length = 0;
}

export function diagnosticsContainSecrets(dump: string): boolean {
  SECRET_RE.lastIndex = 0;
  return SECRET_RE.test(dump);
}
