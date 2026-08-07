import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { getProfile, listSkills, insertSkill, insertSkillSyncEvent, insertAuditEvent, generateId } from "./profile-runtime-db";
import { profileHome } from "./config-importer";
import type { CopySkillRequest, CopySkillResult } from "../shared/profile-runtime/profile-runtime-contract";
import { ProfileRuntimeError } from "../shared/profile-runtime/profile-runtime-errors";

function calculateChecksum(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function backupTarget(filePath: string): string {
  const timestamp = Date.now();
  const backupPath = `${filePath}.backup.${timestamp}`;
  copyFileSync(filePath, backupPath);
  return backupPath;
}

export function copySkill(request: CopySkillRequest): CopySkillResult[] {
  const sourceProfile = getProfile(request.sourceProfileId);
  if (!sourceProfile) throw new ProfileRuntimeError("PROFILE_NOT_FOUND", request.sourceProfileId);

  const sourceHome = profileHome(sourceProfile.name);
  const sourceSkillPath = join(sourceHome, "skills", request.skillPath);

  if (!existsSync(sourceSkillPath)) {
    throw new ProfileRuntimeError("PROFILE_SKILL_NOT_FOUND", request.skillPath);
  }

  const results: CopySkillResult[] = [];
  const overwrite = request.overwrite ?? false;

  for (const targetProfileId of request.targetProfileIds) {
    const targetProfile = getProfile(targetProfileId);
    if (!targetProfile) {
      results.push({
        ok: false,
        sourceProfileId: request.sourceProfileId,
        targetProfileId,
        skillPath: request.skillPath,
        action: "failed",
        errorCode: "PROFILE_NOT_FOUND",
        message: `Target profile not found: ${targetProfileId}`,
      });
      continue;
    }

    const targetHome = profileHome(targetProfile.name);
    const targetSkillPath = join(targetHome, "skills", request.skillPath);

    try {
      if (existsSync(targetSkillPath)) {
        if (!overwrite) {
          insertSkillSyncEvent({
            id: generateId(),
            source_profile_id: request.sourceProfileId,
            target_profile_id: targetProfileId,
            skill_path: request.skillPath,
            action: "skipped",
            overwrite: false,
            backup_path: null,
            status: "completed",
            error_message: null,
          });

          results.push({
            ok: true,
            sourceProfileId: request.sourceProfileId,
            targetProfileId,
            skillPath: request.skillPath,
            action: "skipped",
          });
          continue;
        }

        const backupPath = backupTarget(targetSkillPath);
        mkdirSync(dirname(targetSkillPath), { recursive: true });
        copyFileSync(sourceSkillPath, targetSkillPath);

        const checksum = calculateChecksum(targetSkillPath);

        insertSkillSyncEvent({
          id: generateId(),
          source_profile_id: request.sourceProfileId,
          target_profile_id: targetProfileId,
          skill_path: request.skillPath,
          action: "overwritten",
          overwrite: true,
          backup_path: backupPath,
          status: "completed",
          error_message: null,
        });

        insertAuditEvent({
          id: generateId(),
          event_type: "skill_sync",
          profile_id: targetProfileId,
          source: "system",
          action: "overwrite_skill",
          payload_json: JSON.stringify({ source: request.sourceProfileId, skill: request.skillPath, backup: backupPath }),
          status: "success",
          error_message: null,
        });

        results.push({
          ok: true,
          sourceProfileId: request.sourceProfileId,
          targetProfileId,
          skillPath: request.skillPath,
          action: "overwritten",
        });
      } else {
        mkdirSync(dirname(targetSkillPath), { recursive: true });
        copyFileSync(sourceSkillPath, targetSkillPath);

        const checksum = calculateChecksum(targetSkillPath);
        const skillName = request.skillPath.split("/").pop() ?? request.skillPath;

        insertSkill({
          id: generateId(),
          profile_id: targetProfileId,
          skill_path: request.skillPath,
          skill_name: skillName,
          category: null,
          source_type: "synced",
          source_profile_id: request.sourceProfileId,
          filesystem_path: targetSkillPath,
          checksum,
          enabled: true,
        });

        insertSkillSyncEvent({
          id: generateId(),
          source_profile_id: request.sourceProfileId,
          target_profile_id: targetProfileId,
          skill_path: request.skillPath,
          action: "copied",
          overwrite: false,
          backup_path: null,
          status: "completed",
          error_message: null,
        });

        insertAuditEvent({
          id: generateId(),
          event_type: "skill_sync",
          profile_id: targetProfileId,
          source: "system",
          action: "copy_skill",
          payload_json: JSON.stringify({ source: request.sourceProfileId, skill: request.skillPath }),
          status: "success",
          error_message: null,
        });

        results.push({
          ok: true,
          sourceProfileId: request.sourceProfileId,
          targetProfileId,
          skillPath: request.skillPath,
          action: "copied",
        });
      }
    } catch (e) {
      if (existsSync(targetSkillPath) && !existsSync(targetSkillPath + ".orig")) {
        try { existsSync(targetSkillPath) && !calculateChecksum(targetSkillPath); } catch { /* remove incomplete */ }
      }

      insertSkillSyncEvent({
        id: generateId(),
        source_profile_id: request.sourceProfileId,
        target_profile_id: targetProfileId,
        skill_path: request.skillPath,
        action: "failed",
        overwrite,
        backup_path: null,
        status: "failed",
        error_message: String(e),
      });

      results.push({
        ok: false,
        sourceProfileId: request.sourceProfileId,
        targetProfileId,
        skillPath: request.skillPath,
        action: "failed",
        errorCode: "PROFILE_SKILL_COPY_FAILED",
        message: String(e),
      });
    }
  }

  return results;
}
