import { useEffect, useState } from "react";
import { PROVIDERS } from "../constants";

export type DiscoveryStatus =
  | "idle"
  | "loading"
  | "ok"
  | "unsupported"
  | "no-key"
  | "error";

interface UseDiscoveredModelsOptions {
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  profile?: string;
  enabled?: boolean;
  refreshToken?: number;
}

function resolveSetupProvider(provider: string): (typeof PROVIDERS.setup)[number] | undefined {
  return PROVIDERS.setup.find((s) => s.id === provider);
}

function resolveBaseUrl(provider: string, baseUrl?: string): string | null {
  if (provider === "auto") return null;
  if (provider === "custom") {
    const trimmed = baseUrl?.trim();
    return trimmed ? trimmed.replace(/\/$/, "") : null;
  }
  const setup = resolveSetupProvider(provider);
  const url = setup?.baseUrl?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function resolveEnvKey(provider: string, baseUrl?: string): string | undefined {
  if (provider === "custom") {
    const url = baseUrl || "";
    if (/openrouter\.ai/i.test(url)) return "OPENROUTER_API_KEY";
    if (/anthropic\.com/i.test(url)) return "ANTHROPIC_API_KEY";
    if (/openai\.com/i.test(url)) return "OPENAI_API_KEY";
    return "CUSTOM_API_KEY";
  }
  return resolveSetupProvider(provider)?.envKey;
}

export function useDiscoveredModels({
  provider,
  baseUrl,
  apiKey,
  profile,
  enabled = true,
  refreshToken = 0,
}: UseDiscoveredModelsOptions): {
  models: string[];
  status: DiscoveryStatus;
} {
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<DiscoveryStatus>("idle");

  useEffect(() => {
    if (!enabled || provider === "auto") {
      setModels([]);
      setStatus("idle");
      return;
    }

    const resolvedBase = resolveBaseUrl(provider, baseUrl);
    if (!resolvedBase) {
      setModels([]);
      setStatus("unsupported");
      return;
    }

    let cancelled = false;

    void (async () => {
      setStatus("loading");
      try {
        const setup = resolveSetupProvider(provider);
        let key = apiKey?.trim() || "";
        if (!key) {
          const envKey = resolveEnvKey(provider, baseUrl);
          if (envKey) {
            const env = await window.hermesAPI.getEnv(profile);
            key = env[envKey]?.trim() || "";
          }
        }

        if (!key && setup?.needsKey) {
          if (!cancelled) {
            setModels([]);
            setStatus("no-key");
          }
          return;
        }

        const headers: Record<string, string> = { Accept: "application/json" };
        if (key) headers.Authorization = `Bearer ${key}`;

        const response = await fetch(`${resolvedBase}/models`, { headers });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as {
          data?: Array<{ id?: string }>;
        };
        const ids = (payload.data ?? [])
          .map((row) => row.id?.trim())
          .filter((id): id is string => Boolean(id))
          .sort((a, b) => a.localeCompare(b));

        if (!cancelled) {
          setModels(ids);
          setStatus("ok");
        }
      } catch {
        if (!cancelled) {
          setModels([]);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provider, baseUrl, apiKey, profile, enabled, refreshToken]);

  return { models, status };
}
