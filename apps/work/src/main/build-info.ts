/**
 * Packaged Work build identity (schema smc.work.build.v1).
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { app } from "electron";

export const DEFAULT_RUNTIME_ADAPTER = "legacy-local";
export const DEFAULT_RUNTIME_CONTRACT = "managed-local-v1";

export interface WorkBuildInfo {
  schema: "smc.work.build.v1";
  version: string;
  gitCommit: string;
  gitBranch: string;
  buildTime: string;
  runtimeAdapter: string;
  runtimeContract: string;
  dirty?: boolean;
}

function candidatePaths(): string[] {
  const paths: string[] = [];
  if (process.resourcesPath) {
    paths.push(join(process.resourcesPath, "work-build-info.json"));
    paths.push(join(process.resourcesPath, "resources", "work-build-info.json"));
  }
  try {
    if (app?.isReady?.()) {
      paths.push(join(app.getAppPath(), "resources", "work-build-info.json"));
    }
  } catch {
    /* app not available in unit tests */
  }
  paths.push(join(process.cwd(), "resources", "work-build-info.json"));
  return paths;
}

export function logWorkStartupIdentity(controlOwner: string): void {
  const info = loadWorkBuildInfo();
  let version = info?.version ?? "";
  if (!version) {
    try {
      version = app.getVersion();
    } catch {
      version = "unknown";
    }
  }
  const payload = {
    event: "work_startup_identity",
    version,
    gitCommit: info?.gitCommit ?? "unknown",
    gitBranch: info?.gitBranch ?? "unknown",
    buildTime: info?.buildTime ?? "",
    runtimeAdapter: info?.runtimeAdapter ?? DEFAULT_RUNTIME_ADAPTER,
    runtimeContract: info?.runtimeContract ?? DEFAULT_RUNTIME_CONTRACT,
    controlOwner,
  };
  console.info(JSON.stringify(payload));
}

export function loadWorkBuildInfo(): WorkBuildInfo | null {
  for (const path of candidatePaths()) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as WorkBuildInfo;
      if (parsed.schema !== "smc.work.build.v1") return null;
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}
