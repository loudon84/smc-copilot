/**
 * Apply Work-bundled SMC Hermes policy (PRD §9.4 field map only).
 * Merge managed fields into config.yaml; preserve API_SERVER_KEY create-if-absent.
 * Paths MUST resolve under Hermes Root — never ProgramData SMC Hermes.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { randomBytes } from "crypto";
import { getActiveProfileHome, getHermesRoot } from "./hermes-root";

export interface SmcPolicyDocument {
  version: string;
  gateway: {
    enabled: boolean;
    bind: string;
    port: number;
    authRequired: boolean;
  };
  managedConfig: {
    defaults: Record<string, unknown>;
    enforced: {
      terminal?: { cwd?: string | null };
      security?: Record<string, unknown>;
      mcp_servers?: {
        workspace?: {
          enabled?: boolean;
          command?: string | null;
          args?: string[] | null;
        };
      };
    };
  };
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(
        target[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function candidatePolicyPaths(
  policyVersion: string,
  extras: string[] = [],
): string[] {
  const rel = join("hermes-policy", `${policyVersion}.json`);
  const out: string[] = [...extras];
  const resourcesPath = (
    process as NodeJS.Process & { resourcesPath?: string }
  ).resourcesPath;
  if (resourcesPath) out.push(join(resourcesPath, rel));
  out.push(join(__dirname, "../../../resources", rel));
  out.push(join(process.cwd(), "resources", rel));
  out.push(join(process.cwd(), "apps/work/resources", rel));
  return out;
}

export function loadSmcPolicy(
  policyVersion: string,
  explicitPath?: string | null,
): SmcPolicyDocument {
  const paths = explicitPath
    ? [explicitPath, ...candidatePolicyPaths(policyVersion)]
    : candidatePolicyPaths(policyVersion);
  for (const p of paths) {
    if (!p || !existsSync(p)) continue;
    return JSON.parse(readFileSync(p, "utf-8")) as SmcPolicyDocument;
  }
  throw new Error(
    `HERMES_POLICY_MISSING: policy ${policyVersion} not found under resources/hermes-policy`,
  );
}

export function resolveNativeNodePath(hermesRoot: string): string {
  return join(hermesRoot, "node", "node.exe");
}

export function resolveWorkspacePath(
  hermesRoot: string,
  profile?: string,
): string {
  const home = profile && profile !== "default"
    ? getActiveProfileHome(profile)
    : hermesRoot;
  return join(home, "workspace");
}

function assertNotProgramData(path: string): void {
  const lower = path.replace(/\//g, "\\").toLowerCase();
  if (lower.includes("\\programdata\\smc\\hermes")) {
    throw new Error(
      `A-POLICY-003: policy path must not use ProgramData SMC Hermes: ${path}`,
    );
  }
}

function ensureApiServerKey(
  envPath: string,
  authRequired: boolean,
): void {
  if (!authRequired) return;
  mkdirSync(dirname(envPath), { recursive: true });
  let existing = "";
  if (existsSync(envPath)) {
    existing = readFileSync(envPath, "utf-8");
    if (/^API_SERVER_KEY\s*=/m.test(existing)) return;
  }
  const key = randomBytes(24).toString("hex");
  const line = `API_SERVER_KEY=${key}\n`;
  writeFileSync(
    envPath,
    existing && !existing.endsWith("\n") ? `${existing}\n${line}` : `${existing}${line}`,
    "utf-8",
  );
}

function atomicWriteJsonOrYaml(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, path);
}

/**
 * Map §9.4 source fields → config.yaml managed subset only.
 */
export function buildManagedConfigPatch(
  policy: SmcPolicyDocument,
  opts: {
    hermesRoot: string;
    profile?: string;
    isNamedProfile: boolean;
  },
): Record<string, unknown> {
  const workspace = resolveWorkspacePath(opts.hermesRoot, opts.profile);
  const nativeNode = resolveNativeNodePath(opts.hermesRoot);
  assertNotProgramData(workspace);
  assertNotProgramData(nativeNode);

  const defaults = policy.managedConfig?.defaults ?? {};
  const enforced = policy.managedConfig?.enforced ?? {};

  const patch: Record<string, unknown> = {};

  // defaults → top-level same-name nests (§9.4)
  for (const key of [
    "terminal",
    "code_execution",
    "web",
    "logging",
    "sessions",
    "memory",
    "stt",
    "lsp",
    "secrets",
    "platform_toolsets",
    "toolsets",
  ] as const) {
    if (defaults[key] !== undefined) patch[key] = defaults[key];
  }
  if (defaults.timezone !== undefined) patch.timezone = defaults.timezone;
  if (
    defaults.gateway &&
    typeof defaults.gateway === "object" &&
    (defaults.gateway as { strict?: unknown }).strict !== undefined
  ) {
    patch.gateway = {
      strict: (defaults.gateway as { strict: boolean }).strict,
    };
  }

  // enforced terminal.cwd
  const terminal = {
    ...((patch.terminal as Record<string, unknown>) || {}),
    cwd: workspace,
  };
  patch.terminal = terminal;

  if (enforced.security) {
    patch.security = enforced.security;
  }

  const mcpArgs = [
    "-y",
    "@modelcontextprotocol/server-filesystem@2025.8.21",
    workspace,
  ];
  patch.mcp_servers = {
    workspace: {
      enabled: enforced.mcp_servers?.workspace?.enabled !== false,
      command: nativeNode,
      args: mcpArgs,
    },
  };

  // gateway → platforms.api_server (§9.4)
  const apiServer: Record<string, unknown> = {
    enabled: policy.gateway.enabled,
    extra: {
      host: policy.gateway.bind,
    } as Record<string, unknown>,
  };
  // named port owned by getProfilePort — Policy MUST NOT overwrite
  if (!opts.isNamedProfile) {
    (apiServer.extra as Record<string, unknown>).port = policy.gateway.port;
  }
  patch.platforms = {
    api_server: apiServer,
  };

  return patch;
}

export interface ApplySmcPolicyOptions {
  hermesRoot?: string;
  profile?: string;
  policyVersion: string;
  policyPath?: string | null;
}

export function applySmcPolicy(opts: ApplySmcPolicyOptions): {
  configPath: string;
  workspacePath: string;
  nativeNodePath: string;
} {
  const hermesRoot = opts.hermesRoot ?? getHermesRoot();
  const profile = opts.profile;
  const isNamed = Boolean(profile && profile !== "default");
  const home = isNamed ? getActiveProfileHome(profile) : hermesRoot;
  const policy = loadSmcPolicy(opts.policyVersion, opts.policyPath);
  const patch = buildManagedConfigPatch(policy, {
    hermesRoot,
    profile,
    isNamedProfile: isNamed,
  });

  const configPath = join(home, "config.yaml");
  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    const parsed = parseYaml(readFileSync(configPath, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  }

  // Preserve user-owned fields: deep-merge only overwrites managed keys we set.
  const merged = deepMerge(existing, patch);

  // Preserve named profile port if already present
  if (isNamed) {
    const platforms = (merged.platforms ?? {}) as Record<string, unknown>;
    const api = (platforms.api_server ?? {}) as Record<string, unknown>;
    const extra = (api.extra ?? {}) as Record<string, unknown>;
    const existingPort =
      ((existing.platforms as Record<string, unknown> | undefined)
        ?.api_server as Record<string, unknown> | undefined)?.extra as
        | Record<string, unknown>
        | undefined;
    if (existingPort?.port !== undefined) {
      extra.port = existingPort.port;
      api.extra = extra;
      platforms.api_server = api;
      merged.platforms = platforms;
    }
  }

  atomicWriteJsonOrYaml(configPath, stringifyYaml(merged));

  const envPath = join(home, ".env");
  ensureApiServerKey(envPath, policy.gateway.authRequired === true);

  const workspacePath = resolveWorkspacePath(hermesRoot, profile);
  mkdirSync(workspacePath, { recursive: true });

  return {
    configPath,
    workspacePath,
    nativeNodePath: resolveNativeNodePath(hermesRoot),
  };
}
