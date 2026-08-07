const HEALTH_TIMEOUT_MS = 1500;

/** Read-only Gateway /health probe (does not mutate runtime DB status). */
export async function probeGatewayHealth(host: string, port: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}
