import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { DeploymentConfig } from "../../shared/enterprise/enterprise-schema";

export interface ProvisionResult {
  ok: boolean;
  hermesHome?: string;
  message?: string;
}

export function provisionDefaultHermesHome(
  config: DeploymentConfig,
  agentPath: string,
  venvPath: string,
): ProvisionResult {
  const hermesHome = join(homedir(), ".hermes");

  const dirs = [
    hermesHome,
    join(hermesHome, "memories"),
    join(hermesHome, "skills"),
    join(hermesHome, "desktop"),
    join(hermesHome, "profiles"),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  const configYamlPath = join(hermesHome, "config.yaml");
  if (!existsSync(configYamlPath)) {
    const defaultConfig = `api_server:
  host: ${config.gateway.host}
  port: ${config.profiles.ports?.default || 8642}
  log_level: info

models:
  default_provider: ${config.models.defaultProvider}
  default_model: ${config.models.defaultModel}
`;
    writeFileSync(configYamlPath, defaultConfig, "utf-8");
  }

  const envPath = join(hermesHome, ".env");
  if (!existsSync(envPath)) {
    const defaultEnv = `# Hermes Environment Variables
# Add your API keys below
# OPENAI_API_KEY=your-key-here
# ANTHROPIC_API_KEY=your-key-here
`;
    writeFileSync(envPath, defaultEnv, "utf-8");
  }

  const soulPath = join(hermesHome, "SOUL.md");
  if (!existsSync(soulPath)) {
    writeFileSync(soulPath, "# Hermes Soul\n\nYou are Hermes, a helpful AI assistant.\n", "utf-8");
  }

  return { ok: true, hermesHome };
}
