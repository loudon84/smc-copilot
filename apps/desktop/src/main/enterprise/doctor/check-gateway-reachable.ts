import { existsSync } from "node:fs";
import type { DoctorCheckResult } from "../../../shared/enterprise/enterprise-schema";
import type { DoctorCheckStatus } from "../../../shared/enterprise/enterprise-constants";

export async function checkGatewayReachable(host: string, port: number, timeoutMs = 5000): Promise<DoctorCheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return {
      id: "gateway-reachable",
      name: "Gateway 可达性",
      status: response.ok ? "pass" : "fail",
      message: response.ok ? "Gateway /health 响应正常" : `Gateway /health 返回 ${response.status}`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: "gateway-reachable",
      name: "Gateway 可达性",
      status: "fail",
      message: `Gateway 不可达: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}
