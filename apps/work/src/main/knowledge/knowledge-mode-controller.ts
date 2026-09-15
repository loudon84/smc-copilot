/**
 * Main-only Knowledge Mode Controller (AC-01 / AC-09).
 * Resolves immutable dataMode at start. Never reads Renderer Preference/URL/localStorage
 * and never reuses the Skill Run feature mode API.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  KnowledgeActiveDataMode,
  KnowledgeDataMode,
  KnowledgeModeSnapshot,
} from "../../shared/knowledge/knowledge-job-ipc";

export const KNOWLEDGE_MODE_ENV = {
  mode: "SMC_KNOWLEDGE_MODE",
  allowSyntheticData: "SMC_KNOWLEDGE_ALLOW_SYNTHETIC_DATA",
  channel: "SMC_KNOWLEDGE_CHANNEL",
} as const;

export const KNOWLEDGE_MODE_PACKAGED_SCHEMA = "smc.work.knowledge-mode.v1" as const;
export const KNOWLEDGE_MODE_PACKAGED_FILENAME = "work-knowledge-mode.json";

export type KnowledgeModeConfigSource =
  | "default"
  | "env"
  | "packaged"
  | "env+packaged";

export interface KnowledgeModePackagedConfig {
  schema: typeof KNOWLEDGE_MODE_PACKAGED_SCHEMA;
  mode?: KnowledgeActiveDataMode | string;
  allowSyntheticData?: boolean;
  channel?: string;
}

export interface KnowledgeModeNonTerminalJob {
  dataMode: KnowledgeDataMode;
  jobId?: string;
}

export interface KnowledgeModeResolveOptions {
  /** Override process.env for tests. */
  env?: NodeJS.ProcessEnv;
  /** Working directory used for packaged candidate paths (defaults to process.cwd()). */
  cwd?: string;
  /** Optional resourcesPath override (Electron process.resourcesPath). */
  resourcesPath?: string | null;
  /** Optional app path override (Electron app.getAppPath()). */
  appPath?: string | null;
  /** Inject packaged config loader; when omitted, candidate-path JSON is loaded. */
  loadPackagedConfig?: () => KnowledgeModePackagedConfig | null;
  /** Non-terminal Jobs probe — refuse target mode if another mode is still live. */
  listNonTerminalJobs?: () => KnowledgeModeNonTerminalJob[];
  /** Diagnostic sink (defaults to console.info JSON). Never log tokens/user content. */
  log?: (payload: Record<string, unknown>) => void;
}

type LatchedMode = KnowledgeModeSnapshot & {
  configSource: KnowledgeModeConfigSource;
};

let latched: LatchedMode | null = null;

function defaultLog(payload: Record<string, unknown>): void {
  console.info(JSON.stringify(payload));
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

function parseMode(raw: string | undefined): KnowledgeActiveDataMode | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "mock" || v === "provider") return v;
  return undefined;
}

/** Mirror build-info candidatePaths for work-knowledge-mode.json. */
export function knowledgeModeCandidatePaths(options: {
  cwd?: string;
  resourcesPath?: string | null;
  appPath?: string | null;
}): string[] {
  const paths: string[] = [];
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  if (resourcesPath) {
    paths.push(join(resourcesPath, KNOWLEDGE_MODE_PACKAGED_FILENAME));
    paths.push(join(resourcesPath, "resources", KNOWLEDGE_MODE_PACKAGED_FILENAME));
  }
  if (options.appPath) {
    paths.push(join(options.appPath, "resources", KNOWLEDGE_MODE_PACKAGED_FILENAME));
  } else {
    try {
      // Lazy require so unit tests without Electron still work.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require("electron") as {
        app?: { isReady?: () => boolean; getAppPath?: () => string };
      };
      if (app?.isReady?.()) {
        const appPath = app.getAppPath?.();
        if (appPath) {
          paths.push(join(appPath, "resources", KNOWLEDGE_MODE_PACKAGED_FILENAME));
        }
      }
    } catch {
      /* app not available in unit tests */
    }
  }
  const cwd = options.cwd ?? process.cwd();
  paths.push(join(cwd, "resources", KNOWLEDGE_MODE_PACKAGED_FILENAME));
  return paths;
}

export function loadPackagedKnowledgeModeConfig(
  options: Pick<
    KnowledgeModeResolveOptions,
    "cwd" | "resourcesPath" | "appPath"
  > = {},
): KnowledgeModePackagedConfig | null {
  for (const path of knowledgeModeCandidatePaths(options)) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(
        readFileSync(path, "utf8"),
      ) as KnowledgeModePackagedConfig;
      if (parsed.schema !== KNOWLEDGE_MODE_PACKAGED_SCHEMA) continue;
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function assertNoCrossModeNonTerminal(
  target: KnowledgeActiveDataMode,
  jobs: KnowledgeModeNonTerminalJob[],
): void {
  const conflict = jobs.find((j) => j.dataMode !== target);
  if (!conflict) return;
  throw new Error("KNOWLEDGE_MODE_NONTERMINAL_CONFLICT");
}

function sanitizeChannel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Channel is a release/build label only — reject values that look like secrets.
  if (/token|secret|bearer|sk-|password|authorization/i.test(trimmed)) {
    return undefined;
  }
  return trimmed.slice(0, 64);
}

/**
 * Resolve effective mode from Main env and/or packaged JSON.
 * Does not latch. Prefer bootstrapKnowledgeMode at process start.
 */
export function resolveKnowledgeMode(
  options: KnowledgeModeResolveOptions = {},
): KnowledgeModeSnapshot {
  if (latched) {
    return {
      dataMode: latched.dataMode,
      allowSyntheticData: latched.allowSyntheticData,
      channel: latched.channel,
      configSource: latched.configSource,
    };
  }
  return computeMode(options).snapshot;
}

/**
 * Resolve and latch immutable dataMode for this Main process lifetime.
 */
export function bootstrapKnowledgeMode(
  options: KnowledgeModeResolveOptions = {},
): KnowledgeModeSnapshot {
  if (latched) {
    throw new Error("KNOWLEDGE_MODE_IMMUTABLE");
  }
  const { snapshot, diagnosticExtras } = computeMode(options);
  latched = {
    dataMode: snapshot.dataMode,
    allowSyntheticData: snapshot.allowSyntheticData,
    channel: snapshot.channel,
    configSource: (snapshot.configSource ?? "default") as KnowledgeModeConfigSource,
  };
  const log = options.log ?? defaultLog;
  log({
    event: "knowledge_mode_resolved",
    dataMode: latched.dataMode,
    allowSyntheticData: latched.allowSyntheticData,
    channel: latched.channel ?? null,
    configSource: latched.configSource,
    ...diagnosticExtras,
  });
  return {
    dataMode: latched.dataMode,
    allowSyntheticData: latched.allowSyntheticData,
    channel: latched.channel,
    configSource: latched.configSource,
  };
}

export function getKnowledgeModeSnapshot(): KnowledgeModeSnapshot {
  if (!latched) {
    throw new Error("KNOWLEDGE_MODE_NOT_BOOTSTRAPPED");
  }
  return {
    dataMode: latched.dataMode,
    allowSyntheticData: latched.allowSyntheticData,
    channel: latched.channel,
    configSource: latched.configSource,
  };
}

export function resetKnowledgeModeControllerForTests(): void {
  latched = null;
}

/** Alias used by tests / callers that prefer resetForTests naming. */
export const resetForTests = resetKnowledgeModeControllerForTests;

function computeMode(options: KnowledgeModeResolveOptions): {
  snapshot: KnowledgeModeSnapshot;
  diagnosticExtras: Record<string, unknown>;
} {
  const env = options.env ?? process.env;
  const log = options.log ?? defaultLog;

  const packaged =
    options.loadPackagedConfig?.() ??
    loadPackagedKnowledgeModeConfig({
      cwd: options.cwd,
      resourcesPath: options.resourcesPath,
      appPath: options.appPath,
    });

  const envMode = parseMode(env[KNOWLEDGE_MODE_ENV.mode]);
  const envAllow = parseBool(env[KNOWLEDGE_MODE_ENV.allowSyntheticData]);
  const envChannel = sanitizeChannel(env[KNOWLEDGE_MODE_ENV.channel]);

  const packagedMode = parseMode(
    typeof packaged?.mode === "string" ? packaged.mode : undefined,
  );
  const packagedAllow =
    typeof packaged?.allowSyntheticData === "boolean"
      ? packaged.allowSyntheticData
      : undefined;
  const packagedChannel = sanitizeChannel(
    typeof packaged?.channel === "string" ? packaged.channel : undefined,
  );

  const declaredMode = envMode ?? packagedMode;
  const declaredAllow = envAllow ?? packagedAllow;
  const channel = envChannel ?? packagedChannel;

  const envContributed =
    envMode !== undefined ||
    envAllow !== undefined ||
    envChannel !== undefined;
  const packagedContributed =
    packagedMode !== undefined ||
    packagedAllow !== undefined ||
    packagedChannel !== undefined;

  let configSource: KnowledgeModeConfigSource = "default";
  if (envContributed && packagedContributed) configSource = "env+packaged";
  else if (envContributed) configSource = "env";
  else if (packagedContributed) configSource = "packaged";

  const wantsMock = declaredMode === "mock";
  const dualDeclared = wantsMock && declaredAllow === true;

  let dataMode: KnowledgeActiveDataMode = "provider";
  let allowSyntheticData = false;

  if (wantsMock && !dualDeclared) {
    log({
      event: "knowledge_mode_mock_rejected",
      reason: "missing_dual_declaration",
      declaredMode: declaredMode ?? null,
      declaredAllowSyntheticData: declaredAllow ?? null,
      configSource,
    });
    dataMode = "provider";
    allowSyntheticData = false;
  } else if (dualDeclared) {
    dataMode = "mock";
    allowSyntheticData = true;
  } else {
    dataMode = declaredMode === "provider" ? "provider" : "provider";
    allowSyntheticData = false;
  }

  const jobs = options.listNonTerminalJobs?.() ?? [];
  assertNoCrossModeNonTerminal(dataMode, jobs);

  return {
    snapshot: {
      dataMode,
      allowSyntheticData,
      channel,
      configSource,
    },
    diagnosticExtras: {},
  };
}
