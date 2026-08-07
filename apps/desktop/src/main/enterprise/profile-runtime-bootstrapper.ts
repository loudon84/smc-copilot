import { existsSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type {
  DeploymentConfig,
} from "../../shared/enterprise/enterprise-schema";

import type { ProfileName } from "../../shared/enterprise/enterprise-constants";

import {
  DEFAULT_PROFILE_NAMES,
  DEFAULT_PROFILE_PORTS,
} from "../../shared/enterprise/enterprise-constants";

export interface ProfileBootstrapProgress {
  profile: string;
  stage: "creating-home" | "writing-config" | "allocating-port" | "completed" | "failed";
  message: string;
}

export type ProfileProgressCallback = (progress: ProfileBootstrapProgress) => void;

export interface ProfileBootstrapResult {
  ok: boolean;
  profiles?: Array<{ name: string; home: string; port: number }>;
  errorCode?: string;
  message?: string;
}

function isPortOccupied(port: number): boolean {
  try {
    const server = require("node:net").createServer();
    server.listen(port, "127.0.0.1");
    server.close();
    return false;
  } catch {
    return true;
  }
}

function allocatePort(preferred: number): number {
  let port = preferred;
  while (port < preferred + 100) {
    if (!isPortOccupied(port)) return port;
    port++;
  }
  throw new Error(`端口 ${preferred}-${preferred + 99} 均被占用`);
}

export function bootstrapProfiles(
  config: DeploymentConfig,
  agentPath: string,
  venvPath: string,
  onProgress?: ProfileProgressCallback,
): ProfileBootstrapResult {
  const hermesHome = join(homedir(), ".hermes");
  const profilesDir = join(hermesHome, "profiles");
  mkdirSync(profilesDir, { recursive: true });

  const profileList: Array<{ name: string; home: string; port: number }> = [];

  for (const name of DEFAULT_PROFILE_NAMES) {
    const isDefault = name === "default";
    const profileHome = isDefault ? hermesHome : join(profilesDir, name);

    onProgress?.({ profile: name, stage: "creating-home", message: `创建 ${name} 目录...` });
    mkdirSync(profileHome, { recursive: true });
    mkdirSync(join(profileHome, "memories"), { recursive: true });
    mkdirSync(join(profileHome, "skills"), { recursive: true });

    const configYamlPath = join(profileHome, "config.yaml");
    if (!existsSync(configYamlPath)) {
      onProgress?.({ profile: name, stage: "writing-config", message: `写入 ${name} config.yaml...` });

      const preferredPort = config.profiles.ports?.[name] || DEFAULT_PROFILE_PORTS[name];
      onProgress?.({ profile: name, stage: "allocating-port", message: `分配端口 ${preferredPort}...` });

      let port: number;
      try {
        port = allocatePort(preferredPort);
      } catch {
        onProgress?.({ profile: name, stage: "failed", message: `端口 ${preferredPort} 附近无可用端口` });
        return { ok: false, errorCode: "E_PORT_EXHAUSTED", message: `${name} 端口耗尽` };
      }

      const profileConfig = `api_server:
  host: ${config.gateway.host}
  port: ${port}
  log_level: info

models:
  default_provider: ${config.models.defaultProvider}
  default_model: ${config.models.defaultModel}
`;
      writeFileSync(configYamlPath, profileConfig, "utf-8");

      const envPath = join(profileHome, ".env");
      if (!existsSync(envPath)) {
        writeFileSync(envPath, `# ${name} Profile Environment\n`, "utf-8");
      }

      const soulPath = join(profileHome, "SOUL.md");
      if (!existsSync(soulPath)) {
        const soulContent = name === "default"
          ? "# Hermes Soul\n\nYou are Hermes, a helpful AI assistant.\n"
          : `# ${name.charAt(0).toUpperCase() + name.slice(1)} Soul\n\nYou are a specialized ${name} assistant.\n`;
        writeFileSync(soulPath, soulContent, "utf-8");
      }

      profileList.push({ name, home: profileHome, port });
    } else {
      const existingPort = config.profiles.ports?.[name] || DEFAULT_PROFILE_PORTS[name];
      profileList.push({ name, home: profileHome, port: existingPort });
    }

    onProgress?.({ profile: name, stage: "completed", message: `${name} 引导完成` });
  }

  return { ok: true, profiles: profileList };
}
