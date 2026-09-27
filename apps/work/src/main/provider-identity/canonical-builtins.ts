/**
 * Closed builtin identity set for P0.1 writers.
 * Source: Hermes Agent v0.21.0 / reference tag v2026.8.31
 * `hermes_cli/models.py` CANONICAL_PROVIDERS plus that file's aliases.
 * `PROVIDER_BASE_URLS` is not this set.
 */
const CANONICAL_SLUGS = new Set([
  "nous",
  "openrouter",
  "anthropic",
  "openai",
  "openai-codex",
  "openai-api",
  "gemini",
  "xai",
  "xiaomi",
  "ollama-cloud",
  "deepseek",
  "alibaba",
]);

const ALIASES: Record<string, string> = {
  qwen: "alibaba",
  dashscope: "alibaba",
  aliyun: "alibaba",
  "alibaba-cloud": "alibaba",
};

export function canonicalBuiltinSlugs(): readonly string[] {
  return [...CANONICAL_SLUGS];
}

export function canonicalBuiltinSlug(provider: string): string | null {
  const value = provider.trim().toLowerCase();
  if (!value) return null;
  if (ALIASES[value]) return ALIASES[value];
  return CANONICAL_SLUGS.has(value) ? value : null;
}
