export function logRuntimeProviderOperation(
  fields: Record<string, unknown>,
): void {
  console.info(JSON.stringify(sanitizeRuntimeLog("runtime_provider_operation", fields)));
}

export function logRuntimeProviderReconcile(
  fields: Record<string, unknown>,
): void {
  console.info(JSON.stringify(sanitizeRuntimeLog("runtime_provider_reconcile", fields)));
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
