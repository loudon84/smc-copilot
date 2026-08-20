/**
 * HTTP probes against the managed Hermes Gateway (health + authenticated API).
 */
// @lat: [[runtime-connection#Gateway probe]]
import http from "http";
import https from "https";
import { getApiServerKey } from "../config";
import {
  getGatewayBaseUrl,
  getGatewayHealthPath,
} from "./hermes-runtime-config";

export type GatewayAuthProbeResult =
  | "ok"
  | "unauthorized"
  | "unreachable";

function requestStatus(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 2000,
): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith("https") ? https : http;
      const req = mod.request(
        url,
        { method: "GET", timeout: timeoutMs, headers },
        (res) => {
          resolve(res.statusCode ?? null);
          res.resume();
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

export async function probeGatewayHealth(
  baseUrl = getGatewayBaseUrl(),
  healthPath = getGatewayHealthPath(),
): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, "")}${healthPath}`;
  const status = await requestStatus(url);
  return status === 200;
}

export async function probeGatewayAuthentication(
  profile?: string,
  baseUrl = getGatewayBaseUrl(),
): Promise<GatewayAuthProbeResult> {
  const root = baseUrl.replace(/\/+$/, "");
  const healthOk = await probeGatewayHealth(root);
  if (!healthOk) {
    return "unreachable";
  }

  const headers: Record<string, string> = {};
  const apiKey = getApiServerKey(profile)?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const status = await requestStatus(`${root}/v1/models`, headers, 3000);
  if (status === 200) {
    return "ok";
  }
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === null) {
    return "unreachable";
  }
  return status >= 400 && status < 500 ? "unauthorized" : "unreachable";
}
