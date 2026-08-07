import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type {
  DeploymentConfig,
  LoadConfigResult,
} from "../../shared/enterprise/enterprise-schema";

import {
  DEFAULT_PROFILE_PORTS,
} from "../../shared/enterprise/enterprise-constants";

import { validateDeploymentConfig } from "./deployment-schema";
import { resolveInstallLocation } from "./windows/install-location-resolver";

function getInstallBasePath(): string {
  return process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
}

/** Runtime root under install dir ($INSTDIR/runtime). */
export function getHermesBasePath(): string {
  return resolveInstallLocation().runtimeRoot;
}

export function getDeploymentConfigPaths(): { primary: string; legacy: string } {
  const runtimeRoot = getHermesBasePath();
  const programData = process.env.PROGRAMDATA || join("C:", "ProgramData");
  return {
    primary: join(runtimeRoot, "deployment.json"),
    legacy: join(programData, "AIOS-Hermes", "deployment.json"),
  };
}

export function getDefaultDeploymentConfig(): DeploymentConfig {
  const runtimeRoot = getHermesBasePath();
  const hermesHome = join(homedir(), ".hermes");

  return {
    schemaVersion: "1.2.1",
    company: "default",
    installMode: "windows-native",
    installScope: "current-user",
    desktop: {
      channel: "stable",
      autoUpdate: true,
      updateProvider: "intranet-artifact",
      updateUrl: "",
    },
    runtimeBundle: {
      sourceType: "offline",
      bundleUrl: "",
      bundleSha256: "",
      offlineBundlePath: "",
      allowFallbackToGit: false,
    },
    hermesAgent: {
      sourceType: "release-zip",
      version: "latest",
      gitUrl: "",
      branch: "",
      commit: "",
      tag: "",
      authMode: "none",
      shallowClone: true,
    },
    runtime: {
      pythonVersion: "3.11",
      useBundledPython: true,
      useBundledGit: true,
      useBundledUv: true,
      pipIndexUrl: "https://pypi.tuna.tsinghua.edu.cn/simple",
      trustedHost: "pypi.tuna.tsinghua.edu.cn",
      preferWheelhouse: true,
      wheelhousePath: join(runtimeRoot, "wheels"),
    },
    profiles: {
      enabled: true,
      profileRuntimeYaml: join(hermesHome, "desktop", "profile-runtime.yaml"),
      autoStart: ["default" as const],
      ports: { ...DEFAULT_PROFILE_PORTS },
    },
    gateway: {
      host: "127.0.0.1",
      healthPath: "/health",
      startupTimeoutMs: 60000,
      healthIntervalMs: 15000,
      autoRestart: true,
    },
    models: {
      defaultProvider: "ollama",
      defaultModel: "gemma4-e4b",
      providers: {
        ollama: {
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKeyEnv: "OLLAMA_API_KEY",
          fallbackApiKey: "ollama",
        },
      },
    },
    security: {
      allowUserEditGitUrl: false,
      allowGitBranchSwitch: false,
      allowRemoteGateway: false,
      verifyBundleSha256: true,
      verifyManifestSignature: true,
      maskSecretsInLogs: true,
      allowedGatewayHost: "127.0.0.1",
    },
    policy: {
      enableProfilePolicy: true,
      policyFile: join(hermesHome, "desktop", "profile-policy.yaml"),
    },
    doctor: {
      runAfterInstall: true,
      exportReport: true,
    },
  };
}

export function loadDeploymentConfig(configPath?: string): LoadConfigResult {
  const paths = getDeploymentConfigPaths();
  const resolvedPath = configPath || paths.primary;

  if (!existsSync(resolvedPath)) {
    if (resolvedPath !== paths.legacy && existsSync(paths.legacy)) {
      return loadDeploymentConfig(paths.legacy);
    }
    const defaultConfig = getDefaultDeploymentConfig();
    return { ok: true, config: defaultConfig, usedDefault: true };
  }

  try {
    const raw = readFileSync(resolvedPath, "utf-8");
    const parsed = JSON.parse(raw);
    const validation = validateDeploymentConfig(parsed);

    if (!validation.ok) {
      return {
        ok: false,
        error: {
          message: "deployment.json schema 校验失败",
          fields: validation.errors,
        },
      };
    }

    return { ok: true, config: parsed as DeploymentConfig, usedDefault: false };
  } catch (err) {
    return {
      ok: false,
      error: {
        message: `deployment.json 读取失败: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

export { getInstallBasePath };
