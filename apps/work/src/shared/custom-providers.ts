/**
 * A user-configured custom (OpenAI-compatible) LLM provider, persisted as a
 * first-class record in the desktop's per-profile `providers.json`.
 *
 * This store owns provider *identity* only — its name and base URL. The API key
 * still lives in the profile's `.env` (under `customProviderEnvKey(name)`, the
 * value never stored here) and the provider's models still live in the global
 * `models.json`. Keeping identity here is what lets a provider render as a card
 * the moment it is saved, before any model is added — previously the card was
 * re-derived solely from `models.json`, so a keyed-but-modelless provider was
 * invisible.
 */
export type ProviderApiMode = "chat_completions" | "anthropic_messages";

export interface CustomProviderRecord {
  /** Stable id (uuid). */
  id: string;
  /** Display name. Changing it must not regenerate providerKey. */
  name: string;
  /** OpenAI-compatible endpoint base URL. */
  baseUrl: string;
  /** Epoch ms the record was first created. */
  createdAt: number;
  /** Immutable Hermes `providers:` key. Absent on v1 rows until migration. */
  providerKey?: string;
  /** Env var name. Empty string means this provider carries no secret. */
  keyEnv?: string;
  /** Closed transport enum. Runtime reads this, not the model row. */
  apiMode?: ProviderApiMode;
  updatedAt?: number;
}

/** Versioned on-disk envelope for `providers.json`. */
export interface CustomProviderFile {
  version: 1 | 2;
  providers: CustomProviderRecord[];
}
