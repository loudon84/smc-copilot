import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { SkillRunFeatureMode } from "../../shared/skill-run";

const VALID_MODES: Set<SkillRunFeatureMode> = new Set([
  "expert-compat",
  "skill-first",
  "local-only",
]);

const DEFAULT_MODE: SkillRunFeatureMode = "skill-first";

function storePath(): string {
  try {
    return join(app.getPath("userData"), "skill-run-feature-mode.json");
  } catch {
    return "skill-run-feature-mode.json";
  }
}

export function getSkillRunFeatureMode(): SkillRunFeatureMode {
  const envMode = process.env.SMC_WORK_SKILL_RUN_MODE;
  if (envMode) {
    if (envMode === "skill-only") return "local-only";
    if (VALID_MODES.has(envMode as SkillRunFeatureMode)) {
      return envMode as SkillRunFeatureMode;
    }
  }

  const file = storePath();
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8")) as { mode?: unknown };
      if (parsed.mode === "skill-only") {
        return "local-only";
      }
      if (typeof parsed.mode === "string" && VALID_MODES.has(parsed.mode as SkillRunFeatureMode)) {
        return parsed.mode as SkillRunFeatureMode;
      }
    } catch {
      // fallback to default
    }
  }

  return DEFAULT_MODE;
}

export function setSkillRunFeatureMode(mode: SkillRunFeatureMode): void {
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid skill run feature mode: ${mode}`);
  }
  const file = storePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ mode, updatedAt: new Date().toISOString() }, null, 2), "utf-8");
}
