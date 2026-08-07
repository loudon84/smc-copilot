import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";
import type {
  CrmBridgeEventType,
  CrmBridgeRouteConfig,
} from "../../shared/crm-bridge/crm-bridge-contract";
import { profileHome } from "../utils";

export interface CrmBridgeConfigFile {
  enabled: boolean;
  allowedOrigins: string[];
  payloadMaxBytes: number;
  trustedGestureWindowMs: number;
  allowedEventTypes: CrmBridgeEventType[];
  routes: Record<string, CrmBridgeRouteConfig>;
}

const DEFAULT_CONFIG: CrmBridgeConfigFile = {
  enabled: true,
  allowedOrigins: [
    "http://localhost:9527",
    "http://127.0.0.1:9527",
    "http://localhost:5178",
    "http://127.0.0.1:5178",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  payloadMaxBytes: 524288,
  trustedGestureWindowMs: 1500,
  allowedEventTypes: [
    "crm.context.submit",
    "crm.product.context.submit",
    "crm.customer.open-ai-panel",
    "crm.quote.create-assist",
    "crm.order.risk-check",
    "crm.page.snapshot-request",
    "crm.page.ready",
  ],
  routes: {
    "crm.context.submit": {
      action: "open-web-operator-panel",
      focusedPanel: "page-structure",
      refreshSnapshot: true,
    },
    "crm.product.context.submit": {
      action: "open-web-operator-panel",
      focusedPanel: "crm-context",
      refreshSnapshot: false,
    },
  },
};

function bundledConfigPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "crm-bridge", "crm-bridge.config.json");
  }
  return join(app.getAppPath(), "resources", "crm-bridge", "crm-bridge.config.json");
}

function userConfigPath(): string {
  return join(profileHome(), "desktop", "crm-bridge.config.json");
}

function loadJsonFile(path: string): Partial<CrmBridgeConfigFile> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Partial<CrmBridgeConfigFile>;
  } catch {
    return null;
  }
}

function mergeConfig(
  base: CrmBridgeConfigFile,
  overlay: Partial<CrmBridgeConfigFile> | null,
): CrmBridgeConfigFile {
  if (!overlay) return base;
  return {
    enabled: overlay.enabled ?? base.enabled,
    allowedOrigins: Array.isArray(overlay.allowedOrigins)
      ? overlay.allowedOrigins
      : base.allowedOrigins,
    payloadMaxBytes:
      typeof overlay.payloadMaxBytes === "number"
        ? overlay.payloadMaxBytes
        : base.payloadMaxBytes,
    trustedGestureWindowMs:
      typeof overlay.trustedGestureWindowMs === "number"
        ? overlay.trustedGestureWindowMs
        : base.trustedGestureWindowMs,
    allowedEventTypes: Array.isArray(overlay.allowedEventTypes)
      ? overlay.allowedEventTypes
      : base.allowedEventTypes,
    routes: {
      ...base.routes,
      ...(overlay.routes ?? {}),
    },
  };
}

let cachedConfig: CrmBridgeConfigFile | null = null;

export function getCrmBridgeConfig(): CrmBridgeConfigFile {
  if (cachedConfig) return cachedConfig;

  let config = { ...DEFAULT_CONFIG };
  const bundled = loadJsonFile(bundledConfigPath());
  config = mergeConfig(config, bundled);
  const user = loadJsonFile(userConfigPath());
  config = mergeConfig(config, user);
  cachedConfig = config;
  return config;
}

export function reloadCrmBridgeConfig(): CrmBridgeConfigFile {
  cachedConfig = null;
  return getCrmBridgeConfig();
}

export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;
    const hostWithPort = parsed.host;

    for (const pattern of allowedOrigins) {
      if (pattern === origin) return true;

      if (pattern.startsWith("https://*.") || pattern.startsWith("http://*.")) {
        const suffix = pattern.replace(/^https?:\/\*\./, "");
        if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
          return true;
        }
        continue;
      }

      try {
        const patternUrl = new URL(pattern);
        if (patternUrl.origin === parsed.origin) return true;
        if (patternUrl.hostname === hostname) return true;
      } catch {
        if (pattern === hostname || pattern === hostWithPort) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}
