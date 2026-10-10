export const NODESKCLAW_PROVIDER_KEY = "nodeskclaw";
export const NODESKCLAW_PROVIDER_REF = "named:nodeskclaw";
export const NODESKCLAW_KEY_ENV = "NODESKCLAW_RUNTIME_MODEL_API_KEY";
export const NODESKCLAW_DISPLAY_NAME = "SMC Enterprise Model";
export const NODESKCLAW_API_MODE = "chat_completions" as const;
export const RUNTIME_BOOTSTRAP_PATH = "/api/v1/runtime/model-bootstrap";

export const BOOTSTRAP_REQUEST_BODY = {
  consumer: "smc-copilot",
  runtime: "hermes-agent",
} as const;

const NOT_READY_STATES = new Set([
  "MODEL_NOT_CONFIGURED",
  "MODEL_CREDENTIAL_CLOSING",
  "MODEL_CREDENTIAL_DISABLED",
  "MODEL_PROVIDER_UNSUPPORTED",
  "MODEL_SYNC_NOT_READY",
  "MODEL_CREDENTIAL_INVALID",
  "MODEL_LIST_EMPTY",
  "MODEL_DEFAULT_NOT_SET",
  "MODEL_DEFAULT_INVALID",
]);

export interface ManagedModelContract {
  id: string;
  displayName: string;
}

export interface ReadyRuntimeContract {
  ready: true;
  state: "READY";
  revision: string;
  provider: "new-api";
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  models: ManagedModelContract[];
}

export interface NotReadyRuntimeContract {
  ready: false;
  state: string;
  revision: null;
}

export type RuntimeBootstrapContract =
  | ReadyRuntimeContract
  | NotReadyRuntimeContract;

export type RuntimeBootstrapErrorCode =
  | "RUNTIME_BOOTSTRAP_UNAUTHORIZED"
  | "RUNTIME_BOOTSTRAP_UNAVAILABLE"
  | "RUNTIME_BOOTSTRAP_SCHEMA_INVALID"
  | "MANAGED_PROVIDER_IDENTITY_CONFLICT"
  | "RUNTIME_GATEWAY_RESTART_FAILED"
  | "RUNTIME_SECRET_PURGE_UNVERIFIED"
  | "RUNTIME_PROVIDER_ROLLBACK_FAILED"
  | "RUNTIME_PROVIDER_POST_APPLY_DRIFT"
  | "RUNTIME_PROVIDER_PROJECT_FAILED"
  | "RUNTIME_PROVIDER_APPLY_FAILED"
  | "RUNTIME_PROVIDER_APPLY_SUPERSEDED"
  | "RUNTIME_AUXILIARY_ADOPTION_MISSING"
  | "RUNTIME_AUXILIARY_ADOPTION_INVALID"
  | "RUNTIME_AUXILIARY_RESTORE_FAILED"
  | "RUNTIME_AUXILIARY_ADOPTION_CLEANUP_FAILED"
  | "RUNTIME_NOT_READY"
  | "RUNTIME_PROVIDER_SETTINGS_LOCKED";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function httpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseRuntimeBootstrap(
  body: unknown,
):
  | { ok: true; contract: RuntimeBootstrapContract }
  | { ok: false; error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" } {
  const root = isRecord(body) && isRecord(body.data) ? body.data : body;
  if (!isRecord(root) || typeof root.ready !== "boolean") {
    return { ok: false, error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" };
  }
  if (root.ready === false) {
    if ("api_key" in root && root.api_key != null && root.api_key !== "") {
      return { ok: false, error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" };
    }
    const state = typeof root.state === "string" ? root.state : "";
    if (!NOT_READY_STATES.has(state)) {
      return { ok: false, error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" };
    }
    return {
      ok: true,
      contract: { ready: false, state, revision: null },
    };
  }
  const revision = typeof root.revision === "string" ? root.revision : "";
  const baseUrl = typeof root.base_url === "string" ? root.base_url.trim() : "";
  const apiKey = typeof root.api_key === "string" ? root.api_key : "";
  const defaultModel =
    typeof root.default_model === "string" ? root.default_model : "";
  if (
    root.state !== "READY" ||
    root.provider !== "new-api" ||
    !revision ||
    !httpUrl(baseUrl) ||
    !apiKey ||
    !defaultModel ||
    !Array.isArray(root.models)
  ) {
    return { ok: false, error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" };
  }
  const models: ManagedModelContract[] = [];
  const seen = new Set<string>();
  for (const row of root.models) {
    if (!isRecord(row) || typeof row.id !== "string" || !row.id) {
      return { ok: false, error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" };
    }
    if (seen.has(row.id)) {
      return { ok: false, error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" };
    }
    seen.add(row.id);
    models.push({
      id: row.id,
      displayName:
        typeof row.display_name === "string" && row.display_name
          ? row.display_name
          : row.id,
    });
  }
  if (!seen.has(defaultModel)) {
    return { ok: false, error: "RUNTIME_BOOTSTRAP_SCHEMA_INVALID" };
  }
  return {
    ok: true,
    contract: {
      ready: true,
      state: "READY",
      revision,
      provider: "new-api",
      baseUrl,
      apiKey,
      defaultModel,
      models,
    },
  };
}
