const HEALTH_TIMEOUT_MS = 3000;

export async function checkCopilotServeHealth(healthUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}
