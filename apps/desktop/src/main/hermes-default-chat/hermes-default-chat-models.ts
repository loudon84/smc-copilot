import { listModels, resolveSavedModelById, type SavedModel } from "../models";
import { getModelConfig } from "../config";
import { isWebOperatorPanelDraftSession as isWebOperatorPanelDraftSessionShared } from "../../shared/web-operator/web-operator-panel-draft-session";
import {
  readHermesConfig,
  setDefaultHermesModel,
} from "../hermes-config/hermes-config-yaml";
import type {
  HermesChatModel,
  HermesChatModelConfig,
  HermesChatModelListResponse,
  SetHermesChatModelConfigPayload,
} from "../../shared/hermes-default-chat/hermes-default-chat-contract";

function profileId(profile?: string): string {
  return profile?.trim() || "default";
}

function findSavedModel(models: SavedModel[], cfg: { provider: string; model: string }): SavedModel | undefined {
  return models.find((m) => m.provider === cfg.provider && m.model === cfg.model);
}

function toHermesChatModel(m: SavedModel, isCurrent: boolean): HermesChatModel {
  return {
    id: m.id,
    label: m.name,
    provider: m.provider,
    base_url: m.baseUrl || null,
    model: m.model,
    api_key_env: m.apiKeyEnv ?? null,
    api_key_literal: m.apiKeyLiteral ?? null,
    source: "models.json",
    is_current: isCurrent,
  };
}

export function listHermesChatModels(profile?: string): HermesChatModelListResponse {
  const pid = profileId(profile);
  const saved = listModels();
  const cfg = getModelConfig(profile);
  const models: HermesChatModel[] = saved.map((m) =>
    toHermesChatModel(m, m.provider === cfg.provider && m.model === cfg.model),
  );
  return { profile_id: pid, models, status: null };
}

export function getHermesChatModelConfig(profile?: string): HermesChatModelConfig | null {
  const pid = profileId(profile);
  const cfg = getModelConfig(profile);
  if (!cfg.model && !cfg.provider) return null;
  const saved = findSavedModel(listModels(), cfg);
  return {
    profile_id: pid,
    provider: cfg.provider,
    model_id: saved?.id ?? cfg.model,
    model_label: saved?.name ?? cfg.model,
    base_url: cfg.baseUrl || null,
    updated_at: new Date().toISOString(),
  };
}

export function setHermesChatModelConfig(
  profile: string | undefined,
  payload: SetHermesChatModelConfigPayload,
): HermesChatModelConfig {
  setDefaultHermesModel(profile, payload.model_id);
  return getHermesChatModelConfig(profile)!;
}

export function resolveModelIdForSend(
  modelId: string | undefined,
  profile?: string,
): SavedModel | null {
  if (!modelId?.trim()) return null;
  return resolveSavedModelById(modelId);
}

export function isWebOperatorPanelDraftSession(sessionId: string | undefined): boolean {
  return isWebOperatorPanelDraftSessionShared(sessionId);
}

/**
 * Models 页 Set Default 写入的根级 `default:`（非 `model:` 段 overlay）。
 * Gateway 推理实际读 `model.default`，侧栏发送不得再 overlay 污染该段。
 */
export function resolveModelsPageDefaultSavedModel(profile?: string): SavedModel | null {
  const doc = readHermesConfig(profile);
  const modelName = typeof doc.default === "string" ? doc.default.trim() : "";
  if (!modelName) return null;

  const models = listModels();
  const exact = models.find((m) => m.model === modelName);
  if (exact) return exact;

  const provider = typeof doc.provider === "string" ? doc.provider.trim() : "";
  return findSavedModel(models, { provider, model: modelName }) ?? null;
}
