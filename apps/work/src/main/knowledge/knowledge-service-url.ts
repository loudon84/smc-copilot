/**
 * Knowledge service origin. Pages/features MUST NOT hardcode this URL.
 * Default: http://localhost:4530
 */

export const DEFAULT_KNOWLEDGE_SERVICE_URL = "http://localhost:4530";

export function resolveKnowledgeServiceUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.SMC_KNOWLEDGE_SERVICE_URL?.trim();
  const candidate = raw && raw.length > 0 ? raw : DEFAULT_KNOWLEDGE_SERVICE_URL;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("KNOWLEDGE_SERVICE_URL_INVALID");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("KNOWLEDGE_SERVICE_URL_INVALID");
  }
  return url.origin;
}
