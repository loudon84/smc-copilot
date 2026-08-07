import type { AuthEndpointConfig } from "../../shared/auth/auth-contract";
import { buildAllowedOrigins } from "../../shared/auth/auth-url";

export interface TokenInjectionPolicy {
  enabled: boolean;
  allowedOrigins: string[];
}

let policy: TokenInjectionPolicy = {
  enabled: false,
  allowedOrigins: [],
};

export function getTokenInjectionPolicy(): TokenInjectionPolicy {
  return policy;
}

export function updateTokenInjectionPolicy(
  endpointConfig: AuthEndpointConfig | null,
  hasToken: boolean,
): void {
  policy = {
    enabled: Boolean(endpointConfig && hasToken),
    allowedOrigins: endpointConfig ? buildAllowedOrigins(endpointConfig) : [],
  };
}

export function clearTokenInjectionPolicy(): void {
  policy = { enabled: false, allowedOrigins: [] };
}
