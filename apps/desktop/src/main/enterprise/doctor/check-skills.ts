import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DoctorCheckResult } from "../../../shared/enterprise/enterprise-schema";

export function checkSkills(skillsDir: string): DoctorCheckResult {
  const start = Date.now();
  if (!existsSync(skillsDir)) {
    return { id: "skills", name: "Skills 完整性", status: "warn", message: "skills 目录不存在", durationMs: Date.now() - start };
  }
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    const missingFiles: string[] = [];
    for (const dir of dirs) {
      const skillDir = join(skillsDir, dir.name);
      const hasManifest = existsSync(join(skillDir, "manifest.json")) || existsSync(join(skillDir, "skill.json"));
      if (!hasManifest) missingFiles.push(dir.name);
    }
    return {
      id: "skills",
      name: "Skills 完整性",
      status: missingFiles.length === 0 ? "pass" : "warn",
      message: missingFiles.length === 0 ? `${dirs.length} 个 Skills 完整` : `${missingFiles.length} 个 Skill 缺少 manifest`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return { id: "skills", name: "Skills 完整性", status: "error", message: `检查失败: ${err instanceof Error ? err.message : String(err)}`, durationMs: Date.now() - start };
  }
}
