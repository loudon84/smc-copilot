import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { InstallerPrecheck } from "../../shared/enterprise/enterprise-contract";
import { resolveInstallLocation } from "./windows/install-location-resolver";

function isInstallerPrecheck(value: unknown): value is InstallerPrecheck {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.schemaVersion === "string" &&
    typeof record.vcRuntime === "string" &&
    typeof record.git === "string" &&
    typeof record.python === "string" &&
    typeof record.uv === "string" &&
    typeof record.port8642 === "string" &&
    typeof record.installDir === "string" &&
    typeof record.runtimeRoot === "string" &&
    typeof record.binDir === "string" &&
    typeof record.result === "string"
  );
}

export function readInstallerPrecheck(): InstallerPrecheck | null {
  try {
    const location = resolveInstallLocation();
    const precheckPath = join(location.runtimeRoot, "installer-precheck.json");
    if (!existsSync(precheckPath)) {
      return null;
    }
    const raw = readFileSync(precheckPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isInstallerPrecheck(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
