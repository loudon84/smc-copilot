/**
 * G9a — sync Portal login token-store → Hermes plugin credentials.
 * ChatKnowledgeContext / kb-set metadata MUST NOT carry this token.
 */
import { getConnectionConfig, readEnv, setEnvValue } from "../config";
import { ensureFreshAccessToken } from "../auth/ensure-access-token";
import { resolveKnowledgeServiceUrl } from "./knowledge-service-url";
import {
  isDirectControlOwner,
  isExternallyManagedControlOwner,
  isRuntimeControlOwner,
} from "../hermes/control-owner";
import { getRuntimeManagementBackend } from "../runtime/runtime-management-backend";
import { getRuntimeManager } from "../runtime/runtime-manager";

export type KnowledgePluginCredentialSyncResult =
  | { ok: true; url: string; gatewayRestarted: boolean }
  | { ok: false; error: string };

export type KnowledgePluginCredentialSyncDeps = {
  readEnv?: (profile?: string) => Record<string, string>;
  setEnvValue?: (
    key: string,
    value: string,
    profile?: string,
  ) => void;
  ensureFreshAccessToken?: () => Promise<string>;
  resolveKnowledgeServiceUrl?: () => string;
  /** True when a Work-managed local gateway is running and can be restarted. */
  shouldReloadGateway?: (profile?: string) => Promise<boolean>;
  reloadGateway?: (profile?: string) => Promise<boolean>;
};

/** Local Work-managed gateway only — mirrors restart-gateway IPC gates. */
export async function shouldReloadLocalGatewayForPlugin(
  profile?: string,
): Promise<boolean> {
  const conn = getConnectionConfig();
  if (conn.mode !== "local") return false;
  if (isExternallyManagedControlOwner()) return false;
  if (isRuntimeControlOwner()) {
    return getRuntimeManagementBackend().gatewayStatus(profile);
  }
  if (isDirectControlOwner()) {
    const probe = await getRuntimeManager().getStatus();
    return Boolean(probe.gatewayRunning);
  }
  return false;
}

export async function reloadLocalGatewayForPlugin(
  profile?: string,
): Promise<boolean> {
  const conn = getConnectionConfig();
  if (conn.mode !== "local") return false;
  if (isExternallyManagedControlOwner()) return false;
  if (isRuntimeControlOwner()) {
    return getRuntimeManagementBackend().restartGateway(profile);
  }
  if (isDirectControlOwner()) {
    const result = await getRuntimeManager().restart(profile);
    return result.ok;
  }
  return false;
}

/**
 * Write SMC_KB_API_URL + SMC_KB_API_TOKEN into Hermes Home `.env`
 * from the current Portal/desktop auth session. When the token changes and a
 * Work-managed local gateway is running, restart it once so knowledge.retrieve
 * picks up the new Bearer (G9a).
 */
export async function syncKnowledgePluginCredentialsFromPortal(
  profile?: string,
  deps: KnowledgePluginCredentialSyncDeps = {},
): Promise<KnowledgePluginCredentialSyncResult> {
  const readEnvFn = deps.readEnv ?? readEnv;
  const setEnvValueFn = deps.setEnvValue ?? setEnvValue;
  const ensureToken = deps.ensureFreshAccessToken ?? ensureFreshAccessToken;
  const resolveUrl =
    deps.resolveKnowledgeServiceUrl ?? resolveKnowledgeServiceUrl;
  const shouldReload =
    deps.shouldReloadGateway ?? shouldReloadLocalGatewayForPlugin;
  const reloadGateway = deps.reloadGateway ?? reloadLocalGatewayForPlugin;

  let token: string;
  try {
    token = (await ensureToken()).trim();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Portal authentication required";
    return { ok: false, error: `KNOWLEDGE_PLUGIN_AUTH: ${message}` };
  }
  if (!token) {
    return {
      ok: false,
      error: "KNOWLEDGE_PLUGIN_AUTH: Portal access token is empty",
    };
  }

  let url: string;
  try {
    url = resolveUrl();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "KNOWLEDGE_SERVICE_URL_INVALID";
    return { ok: false, error: message };
  }

  const previousToken = (readEnvFn(profile).SMC_KB_API_TOKEN ?? "").trim();
  const tokenChanged = previousToken !== token;

  try {
    setEnvValueFn("SMC_KB_API_URL", url, profile);
    setEnvValueFn("SMC_KB_API_TOKEN", token, profile);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to write Hermes plugin env";
    return {
      ok: false,
      error: `KNOWLEDGE_PLUGIN_CREDENTIAL_SYNC_FAILED: ${message}`,
    };
  }

  // Also expose to this Main process for any in-process consumers / child spawns.
  process.env.SMC_KB_API_URL = url;
  process.env.SMC_KB_API_TOKEN = token;

  let gatewayRestarted = false;
  if (tokenChanged) {
    let needsReload = false;
    try {
      needsReload = await shouldReload(profile);
    } catch {
      needsReload = false;
    }
    if (needsReload) {
      let restarted = false;
      try {
        restarted = await reloadGateway(profile);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "gateway reload threw";
        return {
          ok: false,
          error: `KNOWLEDGE_PLUGIN_GATEWAY_RELOAD_FAILED: ${message}`,
        };
      }
      if (!restarted) {
        return {
          ok: false,
          error:
            "KNOWLEDGE_PLUGIN_GATEWAY_RELOAD_FAILED: Local gateway did not restart after SMC_KB_API_TOKEN sync",
        };
      }
      gatewayRestarted = true;
    }
  }

  return { ok: true, url, gatewayRestarted };
}
