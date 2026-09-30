import { recordDiagnosticEvent } from "./runtime-provider-diagnostics-history";

export function logRuntimeProviderOperation(
  fields: Record<string, unknown>,
): void {
  publishRuntimeLog("runtime_provider_operation", fields);
}

export function logRuntimeProviderReconcile(
  fields: Record<string, unknown>,
): void {
  publishRuntimeLog("runtime_provider_reconcile", fields);
}

function publishRuntimeLog(event: string, fields: Record<string, unknown>): void {
  const safe = sanitizeRuntimeLog(event, fields);
  try {
    recordDiagnosticEvent(safe);
  } catch {
    /* recorder failure cannot affect runtime flow */
  }
  console.info(JSON.stringify(safe));
}

function sanitizeRuntimeLog(
  event: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = { event };
  for (const [key, value] of Object.entries(fields)) {
    if (/secret|api_key|authorization|token|fingerprint|prefix|length|jwt/i.test(key)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}
