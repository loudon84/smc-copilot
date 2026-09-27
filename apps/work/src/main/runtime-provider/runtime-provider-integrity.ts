import { checkProviderProjection } from "../agent-config-providers";
import { getModelConfig } from "../config";
import { readModelsRaw } from "../models";
import { readProviderRegistry } from "../providers-store";
import {
  NODESKCLAW_API_MODE,
  NODESKCLAW_KEY_ENV,
  NODESKCLAW_PROVIDER_KEY,
  NODESKCLAW_PROVIDER_REF,
  type ReadyRuntimeContract,
} from "./runtime-provider-contract";
import {
  adoptionContainsSecret,
  captureRewritableSessionOverrides,
  readAdoption,
} from "./runtime-provider-projection";

export type ProjectionDriftReason =
  | "YAML_PROVIDER_DRIFT"
  | "REGISTRY_DRIFT"
  | "MODEL_SET_DRIFT"
  | "MODEL_ROW_DRIFT"
  | "ACTIVE_PROVIDER_DRIFT"
  | "ACTIVE_DEFAULT_DRIFT"
  | "SESSION_OVERRIDE_DRIFT"
  | "ADOPTION_INVALID";

export type ProjectionIntegrity =
  | { status: "MATCH" }
  | { status: "DRIFTED"; reasons: ProjectionDriftReason[] }
  | { status: "IDENTITY_CONFLICT"; errorCode: "MANAGED_PROVIDER_IDENTITY_CONFLICT" };

export function checkManagedRuntimeProjection(
  profile: string | undefined,
  desired: ReadyRuntimeContract,
): ProjectionIntegrity {
  const reasons: ProjectionDriftReason[] = [];
  const yaml = checkProviderProjection(profile, {
    providerKey: NODESKCLAW_PROVIDER_KEY,
    baseUrl: desired.baseUrl,
    keyEnv: NODESKCLAW_KEY_ENV,
    apiMode: NODESKCLAW_API_MODE,
  });
  if (!yaml.ok) reasons.push("YAML_PROVIDER_DRIFT");

  const registry = readProviderRegistry(profile);
  const managed = registry.providers.filter(
    (row) => row.providerKey === NODESKCLAW_PROVIDER_KEY,
  );
  const foreignKey = registry.providers.some(
    (row) =>
      row.keyEnv === NODESKCLAW_KEY_ENV &&
      row.providerKey &&
      row.providerKey !== NODESKCLAW_PROVIDER_KEY,
  );
  const occupied = managed.some(
    (row) => row.keyEnv && row.keyEnv !== NODESKCLAW_KEY_ENV,
  );
  if (occupied || foreignKey) {
    return {
      status: "IDENTITY_CONFLICT",
      errorCode: "MANAGED_PROVIDER_IDENTITY_CONFLICT",
    };
  }
  const record = managed[0];
  if (
    managed.length !== 1 ||
    !record ||
    record.baseUrl !== desired.baseUrl ||
    record.keyEnv !== NODESKCLAW_KEY_ENV ||
    record.apiMode !== NODESKCLAW_API_MODE ||
    "secret" in record
  ) {
    reasons.push("REGISTRY_DRIFT");
  }

  const rows = readModelsRaw(profile).filter(
    (row) => row.providerRef === NODESKCLAW_PROVIDER_REF,
  );
  const desiredIds = desired.models.map((model) => model.id).sort();
  const actualIds = rows.map((row) => row.model).sort();
  if (actualIds.join("\n") !== desiredIds.join("\n")) reasons.push("MODEL_SET_DRIFT");
  const rowMismatch = desired.models.some((model) => {
    const row = rows.find((item) => item.model === model.id);
    return (
      !row ||
      row.provider !== NODESKCLAW_PROVIDER_KEY ||
      row.providerRef !== NODESKCLAW_PROVIDER_REF ||
      row.baseUrl !== desired.baseUrl
    );
  });
  if (rowMismatch) reasons.push("MODEL_ROW_DRIFT");

  const active = getModelConfig(profile);
  if (active.provider !== NODESKCLAW_PROVIDER_KEY) reasons.push("ACTIVE_PROVIDER_DRIFT");
  if (active.model !== desired.defaultModel) reasons.push("ACTIVE_DEFAULT_DRIFT");

  const allowed = new Set(desired.models.map((model) => model.id));
  const overrideDrift = captureRewritableSessionOverrides(profile).some(
    (row) =>
      row.override.providerRef !== NODESKCLAW_PROVIDER_REF ||
      !allowed.has(row.override.model),
  );
  if (overrideDrift) reasons.push("SESSION_OVERRIDE_DRIFT");

  const adoption = readAdoption(profile);
  if (
    adoptionContainsSecret(profile) ||
    (adoption && (adoption.provider.length === 0 || adoption.model.length === 0))
  ) {
    reasons.push("ADOPTION_INVALID");
  }

  return reasons.length === 0 ? { status: "MATCH" } : { status: "DRIFTED", reasons };
}
