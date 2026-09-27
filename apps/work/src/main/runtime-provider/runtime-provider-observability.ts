export function logRuntimeProviderOperation(
  fields: Record<string, unknown>,
): void {
  const safe: Record<string, unknown> = { event: "runtime_provider_operation" };
  for (const [key, value] of Object.entries(fields)) {
    if (/secret|api_key|authorization|token|fingerprint/i.test(key)) continue;
    safe[key] = value;
  }
  console.info(JSON.stringify(safe));
}
