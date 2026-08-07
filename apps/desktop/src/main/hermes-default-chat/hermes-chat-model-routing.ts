import type { GatewayChatCompletionsBody } from "./hermes-default-chat-request";
import type { SavedModel } from "../models";

export function modelConfigMatchesSaved(
  cfg: { provider: string; model: string; baseUrl: string },
  saved: SavedModel,
): boolean {
  return (
    cfg.provider === saved.provider &&
    cfg.model === saved.model &&
    (cfg.baseUrl || "") === (saved.baseUrl || "")
  );
}

export function buildChatModelRoutingLog(params: {
  profile?: string;
  sessionId?: string;
  modelId?: string;
  apiServerModel: string;
  payload: GatewayChatCompletionsBody;
  gatewayCompletionsUrl: string;
  syncedConfig: boolean;
  restartedGateway: boolean;
  selectedModel?: string;
  selectedBaseUrl?: string;
}): string[] {
  const selectedModel =
    params.selectedModel ??
    params.payload.provider ??
    params.modelId ??
    params.apiServerModel;
  const selectedBaseUrl = params.selectedBaseUrl ?? params.payload.base_url ?? "";

  return [
    "[Hermes Chat] mode=gateway_api",
    `[Hermes Chat] profile=${params.profile ?? "default"}`,
    `[Hermes Chat] session_id=${params.sessionId ?? "new"}`,
    `[Hermes Chat] selected_model=${selectedModel}`,
    `[Hermes Chat] selected_base_url=${selectedBaseUrl}`,
    `[Hermes Chat] config_write=${params.syncedConfig}`,
    `[Hermes Chat] gateway_restart=${params.restartedGateway}`,
  ];
}

export function logChatModelRouting(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}
