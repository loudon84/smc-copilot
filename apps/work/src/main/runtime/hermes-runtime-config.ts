/**
 * Hermes Runtime Descriptor — single source of truth for OPSI Managed Runtime.
 * Work discovers Hermes via home, CLI, and Gateway endpoint only.
 */
// @lat: [[runtime-connection#Path resolution]]
import { existsSync, readFileSync } from "fs";
import { isAbsolute, join, normalize } from "path";
import { app } from "electron";
import { readHermesHomeOverride } from "./hermes-home-override";

export interface HermesRuntimeConfig {
  schemaVersion: 1;
  hermes: {
    home: string;
    programRoot: string;
    cliPath: string;
    agentRoot?: string;
    scriptsRoot?: string;
  };
  gateway: {
    baseUrl: string;
    healthPath: string;
  };
}

const IS_WINDOWS = process.platform === "win32";

const WINDOWS_ENTERPRISE_DEFAULTS: HermesRuntimeConfig = {
  schemaVersion: 1,
  hermes: {
    home: "C:\\ProgramData\\SMC\\Hermes",
    programRoot: "D:\\Programs\\SMC\\Hermes",
    cliPath: "D:\\Programs\\SMC\\Hermes\\bin\\hermes.exe",
    agentRoot: "D:\\Programs\\SMC\\Hermes\\node\\hermes-agent",
    scriptsRoot: "D:\\Programs\\SMC\\Hermes\\scripts",
  },
  gateway: {
    baseUrl: "http://127.0.0.1:8642",
    healthPath: "/health",
  },
};

const NON_WINDOWS_DEFAULTS: HermesRuntimeConfig = {
  schemaVersion: 1,
  hermes: {
    home: join(process.env.HOME || "/tmp", ".hermes"),
    programRoot: join(process.env.HOME || "/tmp", ".hermes"),
    cliPath: join(process.env.HOME || "/tmp", ".hermes", "bin", "hermes"),
    agentRoot: join(process.env.HOME || "/tmp", ".hermes", "hermes-agent"),
    scriptsRoot: join(process.env.HOME || "/tmp", ".hermes", "scripts"),
  },
  gateway: {
    baseUrl: "http://127.0.0.1:8642",
    healthPath: "/health",
  },
};

let cachedConfig: HermesRuntimeConfig | null = null;

export function invalidateHermesRuntimeConfigCache(): void {
  cachedConfig = null;
}

function platformDefaults(): HermesRuntimeConfig {
  return IS_WINDOWS ? WINDOWS_ENTERPRISE_DEFAULTS : NON_WINDOWS_DEFAULTS;
}

function workRuntimeConfigPath(): string {
  const userData = app?.getPath?.("userData");
  return userData ? join(userData, "runtime.json") : "";
}

function enterpriseDescriptorPath(): string {
  if (IS_WINDOWS) {
    const programData = process.env.ProgramData || "C:\\ProgramData";
    return join(programData, "SMC", "hermes-runtime.json");
  }
  return "/etc/smc/hermes-runtime.json";
}

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!path || !existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8").replace(/^\uFEFF/, ""));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeAbsolutePath(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Hermes runtime config: ${field} is empty`);
  }
  const resolved = normalize(trimmed);
  if (!isAbsolute(resolved)) {
    throw new Error(`Hermes runtime config: ${field} must be an absolute path`);
  }
  return resolved;
}

function normalizeGatewayUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Hermes runtime config: gateway.baseUrl is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Hermes runtime config: gateway.baseUrl must be http(s)");
  }
  return trimmed;
}

function mergePartialConfig(
  base: HermesRuntimeConfig,
  partial: Record<string, unknown>,
): HermesRuntimeConfig {
  const hermesPartial =
    typeof partial.hermes === "object" && partial.hermes !== null
      ? (partial.hermes as Record<string, unknown>)
      : {};
  const gatewayPartial =
    typeof partial.gateway === "object" && partial.gateway !== null
      ? (partial.gateway as Record<string, unknown>)
      : {};

  const home =
    typeof hermesPartial.home === "string" && hermesPartial.home.trim()
      ? normalizeAbsolutePath(hermesPartial.home, "hermes.home")
      : base.hermes.home;
  const programRoot =
    typeof hermesPartial.programRoot === "string" &&
    hermesPartial.programRoot.trim()
      ? normalizeAbsolutePath(hermesPartial.programRoot, "hermes.programRoot")
      : base.hermes.programRoot;
  const cliPath =
    typeof hermesPartial.cliPath === "string" && hermesPartial.cliPath.trim()
      ? normalizeAbsolutePath(hermesPartial.cliPath, "hermes.cliPath")
      : base.hermes.cliPath;

  const agentRoot =
    typeof hermesPartial.agentRoot === "string" && hermesPartial.agentRoot.trim()
      ? normalizeAbsolutePath(hermesPartial.agentRoot, "hermes.agentRoot")
      : base.hermes.agentRoot;
  const scriptsRoot =
    typeof hermesPartial.scriptsRoot === "string" &&
    hermesPartial.scriptsRoot.trim()
      ? normalizeAbsolutePath(hermesPartial.scriptsRoot, "hermes.scriptsRoot")
      : base.hermes.scriptsRoot;

  const baseUrl =
    typeof gatewayPartial.baseUrl === "string" && gatewayPartial.baseUrl.trim()
      ? normalizeGatewayUrl(gatewayPartial.baseUrl)
      : base.gateway.baseUrl;
  const healthPath =
    typeof gatewayPartial.healthPath === "string" &&
    gatewayPartial.healthPath.trim()
      ? gatewayPartial.healthPath.trim()
      : base.gateway.healthPath;

  return {
    schemaVersion: 1,
    hermes: {
      home,
      programRoot,
      cliPath,
      agentRoot,
      scriptsRoot,
    },
    gateway: {
      baseUrl,
      healthPath: healthPath.startsWith("/") ? healthPath : `/${healthPath}`,
    },
  };
}

function resolveHermesRuntimeConfig(): HermesRuntimeConfig {
  let config = { ...platformDefaults() };

  const envHome = process.env.HERMES_HOME?.trim();
  if (envHome) {
    config = mergePartialConfig(config, {
      hermes: { home: envHome },
    });
  }

  const homeOverride = readHermesHomeOverride();
  if (homeOverride) {
    config = mergePartialConfig(config, {
      hermes: { home: homeOverride },
    });
  }

  const enterprise = readJsonFile(enterpriseDescriptorPath());
  if (enterprise) {
    try {
      config = mergePartialConfig(config, enterprise);
    } catch {
      /* ignore invalid enterprise descriptor — fall through */
    }
  }

  const workConfig = readJsonFile(workRuntimeConfigPath());
  if (workConfig) {
    config = mergePartialConfig(config, workConfig);
  }

  return config;
}

export function getHermesRuntimeConfig(): HermesRuntimeConfig {
  if (!cachedConfig) {
    cachedConfig = resolveHermesRuntimeConfig();
  }
  return cachedConfig;
}

export function getHermesHome(): string {
  return getHermesRuntimeConfig().hermes.home;
}

export function getHermesProgramRoot(): string {
  return getHermesRuntimeConfig().hermes.programRoot;
}

export function getHermesCliPath(): string {
  return getHermesRuntimeConfig().hermes.cliPath;
}

export function getGatewayBaseUrl(): string {
  return getHermesRuntimeConfig().gateway.baseUrl;
}

export function getGatewayHealthPath(): string {
  return getHermesRuntimeConfig().gateway.healthPath;
}

/** Test helper — replace cached config. */
export function setHermesRuntimeConfigForTests(
  config: HermesRuntimeConfig | null,
): void {
  cachedConfig = config;
}
