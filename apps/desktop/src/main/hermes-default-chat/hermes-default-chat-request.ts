import type { SavedModel } from "../models";
import { readEnv } from "../config";
import { resolveApiKeyForSavedModel } from "../hermes-model-env";
import { resolveModelIdForSend } from "./hermes-default-chat-models";

/** OpenAI-compatible POST /v1/chat/completions body (Hermes Gateway). */
export type GatewayChatCompletionsBody = {
  /** API Server 注册名（如 hermes-agent），非 LLM id。 */
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  stream: boolean;
  /** request-level 路由字段：由 session 选中的 SavedModel 派生。 */
  provider?: string;
  base_url?: string;
  /** request-level API key：用于自定义 OpenAI-compatible 网关转发（例如 DeepSeek/Ollama）。 */
  api_key?: string;
};

/**
 * 构建 Gateway 请求体。
 * `model` 固定为 API Server 名；session 级模型通过 `provider`/`base_url` 透传到 Gateway。
 * 普通聊天路径不写 `config.yaml`，也不触发 Gateway restart。
 */
export function buildGatewayChatCompletionsBody(
  messages: Array<{ role: string; content: unknown }>,
  profile: string | undefined,
  modelId: string | undefined,
  apiServerModel: string,
): GatewayChatCompletionsBody {
  const saved = resolveModelIdForSend(modelId, profile);
  const body: GatewayChatCompletionsBody = {
    model: apiServerModel,
    messages,
    stream: true,
  };
  if (saved) {
    applySavedModelFields(body, saved);
    applySavedModelApiKey(body, saved, profile);
  }
  return body;
}

function applySavedModelFields(
  body: GatewayChatCompletionsBody,
  saved: SavedModel,
): void {
  const provider = saved.provider?.trim();
  if (provider && provider !== "auto") {
    body.provider = provider;
  }
  const baseUrl = saved.baseUrl?.trim();
  if (baseUrl) {
    body.base_url = baseUrl.replace(/\/+$/, "");
  }
}

function applySavedModelApiKey(
  body: GatewayChatCompletionsBody,
  saved: SavedModel,
  profile: string | undefined,
): void {
  const value = resolveApiKeyForSavedModel(saved, readEnv(profile));
  if (value) {
    body.api_key = value;
  }
}
