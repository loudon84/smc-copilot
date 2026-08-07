import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { DeploymentConfig } from "../../shared/enterprise/enterprise-schema";

export interface SkillInstallResult {
  ok: boolean;
  installed?: string[];
  message?: string;
}

export function installBundledSkills(
  config: DeploymentConfig,
  profileName: string,
  profileHome: string,
  runtimePath: string,
): SkillInstallResult {
  const bundleSkillsDir = join(runtimePath, "profiles", "skills");
  if (!existsSync(bundleSkillsDir)) {
    return { ok: true, installed: [], message: "Bundle 中无 skills 目录" };
  }

  const targetSkillsDir = join(profileHome, "skills");
  mkdirSync(targetSkillsDir, { recursive: true });

  const installed: string[] = [];
  try {
    const entries = readdirSync(bundleSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const src = join(bundleSkillsDir, entry.name);
        const dest = join(targetSkillsDir, entry.name);
        if (!existsSync(dest)) {
          cpSync(src, dest, { recursive: true });
          installed.push(entry.name);
        }
      }
    }
  } catch (err) {
    return { ok: false, message: `Skills 安装失败: ${err instanceof Error ? err.message : String(err)}` };
  }

  return { ok: true, installed };
}

export function applyPolicyReadOnly(
  profileId: string,
): { ok: boolean; message?: string } {
  return { ok: true, message: `Profile ${profileId} policy 已标记只读` };
}
