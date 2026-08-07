import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

import { resolveInstallLocation } from "./windows/install-location-resolver";
import type { PipMirrorPresetId } from "../../shared/enterprise/pip-mirror-presets";
import { resolvePipMirrorConfig } from "./pip-mirror-config";

export interface AgentDepsInstallOptions {
  /** Prefer offline wheelhouse when local zip / bundled wheels exist */
  offlineFirst?: boolean;
  pipIndexUrl?: string;
  trustedHost?: string;
  pipMirrorPreset?: string;
}

function normalizeCmd(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join(" ");
}

function hasUvOnPath(): boolean {
  try {
    execSync("uv --version", { encoding: "utf-8", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function discoverWheelhouseDirs(agentDir: string): string[] {
  const candidates: string[] = [
    join(agentDir, "wheels"),
    join(agentDir, "wheelhouse"),
    join(agentDir, "vendor", "wheels"),
    join(dirname(agentDir), "wheels"),
    join(dirname(agentDir), "wheelhouse"),
  ];

  try {
    const loc = resolveInstallLocation();
    candidates.push(join(loc.runtimeRoot, "wheels"));
    candidates.push(join(loc.runtimeRoot, "wheelhouse"));
  } catch {
    /* install location not resolved yet */
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of candidates) {
    if (!seen.has(dir) && existsSync(dir)) {
      seen.add(dir);
      out.push(dir);
    }
  }
  return out;
}

function buildFindLinksArgs(wheelhouses: string[]): string {
  return wheelhouses.map((w) => `--find-links "${w}"`).join(" ");
}

function runCmd(cmd: string, cwd: string): void {
  execSync(cmd, {
    encoding: "utf-8",
    timeout: 300000,
    cwd,
    env: { ...process.env },
  });
}

/**
 * Install hermes-agent Python dependencies without failing on [tool.uv] in pyproject.toml
 * and with optional offline wheelhouse support for local-zip installs.
 */
export function installHermesAgentDependencies(
  agentDir: string,
  pythonBin: string,
  pipBin: string,
  options: AgentDepsInstallOptions = {},
): void {
  const requirementsFile = join(agentDir, "requirements.txt");
  const pyprojectToml = join(agentDir, "pyproject.toml");
  const setupPy = join(agentDir, "setup.py");
  const hasRequirements = existsSync(requirementsFile);
  const hasProject = existsSync(pyprojectToml) || existsSync(setupPy);

  if (!hasRequirements && !hasProject) {
    return;
  }

  const wheelhouses = discoverWheelhouseDirs(agentDir);
  const findLinks = buildFindLinksArgs(wheelhouses);
  const mirror = resolvePipMirrorConfig({
    pipIndexUrl: options.pipIndexUrl,
    trustedHost: options.trustedHost,
    pipMirrorPreset: options.pipMirrorPreset as PipMirrorPresetId | undefined,
  });
  const pipIndex = mirror.pipIndexUrl;
  const indexUrlArg = pipIndex ? `--index-url "${pipIndex}"` : "";
  const pipIndexArg = pipIndex ? `-i "${pipIndex}"` : "";
  const trustedHost = mirror.trustedHost;
  const trustedHostArg = trustedHost ? `--trusted-host ${trustedHost}` : "";

  const useUv = hasUvOnPath();
  const errors: string[] = [];

  const tryRun = (label: string, cmd: string): boolean => {
    try {
      runCmd(cmd, agentDir);
      return true;
    } catch (err) {
      errors.push(`${label}: ${(err as Error).message}`);
      return false;
    }
  };

  const offlineFirst = options.offlineFirst === true && wheelhouses.length > 0;

  if (useUv) {
    const uvBase = [`uv pip install`, `--no-config`, `-p "${pythonBin}"`, indexUrlArg, findLinks];

    if (hasRequirements) {
      if (offlineFirst) {
        const offlineCmd = normalizeCmd([
          ...uvBase,
          `--offline`,
          `-r "${requirementsFile}"`,
        ]);
        if (tryRun("uv requirements (offline)", offlineCmd)) return;
      }

      const reqCmd = normalizeCmd([...uvBase, `-r "${requirementsFile}"`]);
      if (tryRun("uv requirements", reqCmd)) return;
    }

    if (hasProject) {
      if (offlineFirst) {
        const offlineEditable = normalizeCmd([
          ...uvBase,
          `--offline`,
          `-e "${agentDir}"`,
        ]);
        if (tryRun("uv editable (offline)", offlineEditable)) return;
      }

      const editableCmd = normalizeCmd([...uvBase, `-e "${agentDir}"`]);
      if (tryRun("uv editable", editableCmd)) return;
    }
  }

  const pipFindLinks = wheelhouses.map((w) => `--find-links "${w}"`).join(" ");

  if (hasRequirements) {
    if (offlineFirst) {
      const offlineCmd = normalizeCmd([
        `"${pipBin}" install`,
        `--no-index`,
        pipFindLinks,
        `-r "${requirementsFile}"`,
      ]);
      if (tryRun("pip requirements (offline)", offlineCmd)) return;
    }

    const reqCmd = normalizeCmd([
      `"${pipBin}" install`,
      pipIndexArg,
      trustedHostArg,
      pipFindLinks,
      `-r "${requirementsFile}"`,
    ]);
    if (tryRun("pip requirements", reqCmd)) return;
  }

  if (hasProject) {
    const editableCmd = normalizeCmd([
      `"${pipBin}" install`,
      pipIndexArg,
      trustedHostArg,
      pipFindLinks,
      `-e "${agentDir}"`,
    ]);
    if (tryRun("pip editable", editableCmd)) return;
  }

  throw new Error(
    `pip install 失败: ${errors[errors.length - 1] ?? "所有安装策略均未成功"}`,
  );
}
