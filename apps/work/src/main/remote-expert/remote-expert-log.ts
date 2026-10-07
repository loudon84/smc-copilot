import {
  type RemoteExpertObsStage,
  RemoteExpertError,
} from "../../shared/remote-expert";

const SECRET_RE =
  /(?:authorization\s*:\s*bearer\s+\S+|Bearer\s+\S+|access_token|refresh_token|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|execution_capability|internal_token)/gi;

export function redactRemoteExpertText(text: string): string {
  return text.replace(SECRET_RE, "[redacted]");
}

export interface RemoteExpertLogRecord {
  operation_id: string;
  trace_id: string;
  stage: RemoteExpertObsStage;
  status: "STARTED" | "PASS" | "FAIL" | "RETRY";
  timestamp: string;
  agent_ref?: string;
  desktop_session_id?: string;
  acp_session_id?: string;
  request_id?: string;
  last_seq?: number;
  error_code?: string;
  /** Public contract pin fields that failed exact-match. */
  mismatch_fields?: string[];
  mismatch_detail?: Array<{
    field: string;
    expected: string | number;
    observed: string | number;
  }>;
}

const records: RemoteExpertLogRecord[] = [];

export function emitRemoteExpertLog(
  record: Omit<RemoteExpertLogRecord, "timestamp"> & { timestamp?: string },
): void {
  const entry: RemoteExpertLogRecord = {
    ...record,
    timestamp: record.timestamp ?? new Date().toISOString(),
  };
  const serialized = redactRemoteExpertText(JSON.stringify(entry));
  records.push(JSON.parse(serialized) as RemoteExpertLogRecord);
  console.info("[remote-expert]", serialized);
}

export function listRemoteExpertLogs(): RemoteExpertLogRecord[] {
  return [...records];
}

export function resetRemoteExpertLogs(): void {
  records.length = 0;
}

export function logsContainSecrets(dump: string): boolean {
  SECRET_RE.lastIndex = 0;
  return SECRET_RE.test(dump);
}

export function logRemoteExpertError(err: unknown, extra: Partial<RemoteExpertLogRecord>): void {
  try {
    const code =
      err instanceof RemoteExpertError ? err.code : "ACP_PROTOCOL_ERROR";
    emitRemoteExpertLog({
      operation_id: extra.operation_id ?? "unknown",
      trace_id: extra.trace_id ?? "unknown",
      stage: extra.stage ?? "PROMPT",
      status: "FAIL",
      error_code: code,
      agent_ref: extra.agent_ref,
      desktop_session_id: extra.desktop_session_id,
      acp_session_id: extra.acp_session_id,
      request_id: extra.request_id,
      last_seq: extra.last_seq,
    });
  } catch {
    /* logging must not change ACP state */
  }
}
