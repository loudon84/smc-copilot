import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { app, shell } from "electron";
import type {
  HostBridgeConfigFile,
  HostBridgeRouteConfig,
} from "../../shared/crm-bridge/host-bridge-contract";
import { profileHome } from "../utils";
import { isOriginAllowed } from "./crm-bridge-config";

export type { HostBridgeConfigFile, HostBridgeSiteConfig } from "../../shared/crm-bridge/host-bridge-contract";

const DEFAULT_CONFIG: HostBridgeConfigFile = {
  version: "6.0",
  enabled: true,
  payloadMaxBytes: 524288,
  trustedGestureWindowMs: 1500,
  sites: [
    {
      siteId: "crm-lite",
      name: "CRM Lite Demo",
      enabled: true,
      allowedOrigins: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.70.161:3000",
        "http://192.168.70.161",
      ],
    },
    {
      siteId: "sdms-om",
      name: "SDMS Order Management",
      enabled: true,
      allowedOrigins: [
        "http://192.168.70.161",
        "http://192.168.70.161:3000",
        "http://192.168.70.161:8080",
        "http://localhost:8080",
      ],
    },
  ],
  allowedFormTypes: ["product", "customer", "quote", "order", "supplier"],
  allowedActions: ["create", "edit", "view", "analytic"],
  allowedSkills: [
    "crm-product-analytic",
    "crm-product-create",
    "crm-product-edit",
    "crm-quote-risk-check",
  ],
  routes: [
    {
      formType: "product",
      action: "view",
      skillName: "crm-product-analytic",
      desktopAction: "open-web-operator-panel",
      focusedPanel: "host-context",
    },
    {
      formType: "product",
      action: "analytic",
      skillName: "crm-product-analytic",
      desktopAction: "open-hermes-skill",
      focusedPanel: "host-context",
    },
    {
      formType: "product",
      action: "create",
      skillName: "crm-product-create",
      desktopAction: "open-hermes-skill",
      callbackMode: "open-tab-fill-form",
    },
    {
      formType: "product",
      action: "edit",
      skillName: "crm-product-edit",
      desktopAction: "open-hermes-skill",
      callbackMode: "open-tab-fill-form",
    },
  ],
  security: {
    forbiddenPayloadKeys: [
      "password",
      "token",
      "cookie",
      "authorization",
      "apiKey",
      "api_key",
      "secret",
    ],
    allowWildcardSubdomain: true,
    requireUserGesture: true,
  },
};

let cachedConfig: HostBridgeConfigFile | null = null;
let lastLoadedPath: string | null = null;
let lastValidConfig: HostBridgeConfigFile = DEFAULT_CONFIG;

function bundledTemplatePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "crm-bridge", "bridge-config.template.json");
  }
  return join(app.getAppPath(), "resources", "crm-bridge", "bridge-config.template.json");
}

function bundledLegacyConfigPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "crm-bridge", "crm-bridge.config.json");
  }
  return join(app.getAppPath(), "resources", "crm-bridge", "crm-bridge.config.json");
}

function configCandidatePaths(): string[] {
  const userData = app.getPath("userData");
  return [
    join(userData, "bridge-config.json"),
    join(userData, "host-bridge", "bridge-config.json"),
    join(profileHome(), "desktop", "host-bridge.config.json"),
    join(profileHome(), "desktop", "crm-bridge.config.json"),
    bundledTemplatePath(),
    bundledLegacyConfigPath(),
  ];
}

function loadJsonFile(path: string): Partial<HostBridgeConfigFile> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Partial<HostBridgeConfigFile>;
  } catch {
    return null;
  }
}

type LegacyCrmBridgeConfigPartial = Partial<HostBridgeConfigFile> & {
  allowedOrigins?: string[];
};

function applyLegacyAllowedOrigins(
  config: HostBridgeConfigFile,
  origins: string[],
): HostBridgeConfigFile {
  if (!origins.length) return config;

  const mergedOrigins = [...new Set(origins.filter(Boolean))];
  const sites = config.sites.map((site) => {
    if (!site.enabled) return site;
    return {
      ...site,
      allowedOrigins: [...new Set([...site.allowedOrigins, ...mergedOrigins])],
    };
  });

  return { ...config, sites };
}

function mergeConfig(
  base: HostBridgeConfigFile,
  overlay: Partial<HostBridgeConfigFile> | null,
): HostBridgeConfigFile {
  if (!overlay) return base;

  return {
    version: overlay.version ?? base.version,
    enabled: overlay.enabled ?? base.enabled,
    payloadMaxBytes:
      typeof overlay.payloadMaxBytes === "number" ? overlay.payloadMaxBytes : base.payloadMaxBytes,
    trustedGestureWindowMs:
      typeof overlay.trustedGestureWindowMs === "number"
        ? overlay.trustedGestureWindowMs
        : base.trustedGestureWindowMs,
    sites: Array.isArray(overlay.sites) ? overlay.sites : base.sites,
    allowedFormTypes: Array.isArray(overlay.allowedFormTypes)
      ? overlay.allowedFormTypes
      : base.allowedFormTypes,
    allowedActions: Array.isArray(overlay.allowedActions)
      ? overlay.allowedActions
      : base.allowedActions,
    allowedSkills: Array.isArray(overlay.allowedSkills)
      ? overlay.allowedSkills
      : base.allowedSkills,
    routes: Array.isArray(overlay.routes) ? overlay.routes : base.routes,
    security: {
      ...base.security,
      ...(overlay.security ?? {}),
    },
  };
}

function ensureUserConfigFromTemplate(): string {
  const userDataPath = join(app.getPath("userData"), "bridge-config.json");
  if (existsSync(userDataPath)) {
    return userDataPath;
  }

  const templatePath = bundledTemplatePath();
  try {
    const dir = join(app.getPath("userData"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (existsSync(templatePath)) {
      copyFileSync(templatePath, userDataPath);
    } else {
      writeFileSync(userDataPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
    }
  } catch (error) {
    console.warn("[HOST-BRIDGE] Failed to seed bridge-config.json:", error);
  }

  return userDataPath;
}

export function getHostBridgeConfigPath(): string {
  ensureUserConfigFromTemplate();
  for (const path of configCandidatePaths()) {
    if (existsSync(path)) {
      return path;
    }
  }
  return join(app.getPath("userData"), "bridge-config.json");
}

export function getHostBridgeConfig(): HostBridgeConfigFile {
  if (cachedConfig) return cachedConfig;

  ensureUserConfigFromTemplate();

  let config = { ...DEFAULT_CONFIG };
  let loadedFrom: string | null = null;

  for (const path of configCandidatePaths()) {
    const partial = loadJsonFile(path) as LegacyCrmBridgeConfigPartial | null;
    if (partial) {
      config = mergeConfig(config, partial);
      if (Array.isArray(partial.allowedOrigins) && !Array.isArray(partial.sites)) {
        config = applyLegacyAllowedOrigins(config, partial.allowedOrigins);
      }
      loadedFrom = path;
    }
  }

  lastValidConfig = config;
  lastLoadedPath = loadedFrom;
  cachedConfig = config;
  return config;
}

export function reloadHostBridgeConfig(): HostBridgeConfigFile {
  cachedConfig = null;
  return getHostBridgeConfig();
}

export async function openHostBridgeConfigFile(): Promise<void> {
  const path = getHostBridgeConfigPath();
  if (!existsSync(path)) {
    ensureUserConfigFromTemplate();
  }
  await shell.openPath(getHostBridgeConfigPath());
}

export function getHostBridgeAllowedOrigins(config?: HostBridgeConfigFile): string[] {
  const cfg = config ?? getHostBridgeConfig();
  const origins: string[] = [];
  for (const site of cfg.sites) {
    if (!site.enabled) continue;
    origins.push(...site.allowedOrigins);
  }
  return origins;
}

export function isHostOriginAllowed(origin: string, config?: HostBridgeConfigFile): boolean {
  return isOriginAllowed(origin, getHostBridgeAllowedOrigins(config));
}

export function isHostCallbackUrlAllowed(callbackUrl: string, config?: HostBridgeConfigFile): boolean {
  try {
    const origin = new URL(callbackUrl).origin;
    return isHostOriginAllowed(origin, config);
  } catch {
    return false;
  }
}

export function resolveHostBridgeRoute(
  formType: string,
  action: string,
  skillName?: string,
  config?: HostBridgeConfigFile,
): HostBridgeRouteConfig | null {
  const cfg = config ?? getHostBridgeConfig();
  const candidates = [
    `${formType}:${action}:${skillName ?? ""}`,
    `${formType}:${action}:*`,
    `${formType}:${action}`,
  ];

  for (const key of candidates) {
    const route = cfg.routes.find((r) => {
      const routeKey =
        skillName && r.skillName
          ? `${r.formType}:${r.action}:${r.skillName}`
          : `${r.formType}:${r.action}`;
      if (key.endsWith(":*")) {
        return `${r.formType}:${r.action}` === key.slice(0, -2);
      }
      return routeKey === key || `${r.formType}:${r.action}` === key;
    });
    if (route) return route;
  }

  return (
    cfg.routes.find((r) => r.formType === formType && r.action === action) ?? null
  );
}

export function getLastHostBridgeConfigLoadInfo(): {
  path: string | null;
  version: string;
} {
  const cfg = getHostBridgeConfig();
  return { path: lastLoadedPath, version: cfg.version };
}

export { lastValidConfig as getLastValidHostBridgeConfig };
