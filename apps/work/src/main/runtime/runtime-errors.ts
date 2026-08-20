/**
 * Structured Runtime error codes for Copilot Desktop ↔ Hermes connection.
 */

export const RUNTIME_ERROR_CODES = {
  RUNTIME_NOT_FOUND: "RUNTIME_NOT_FOUND",
  RUNTIME_INVALID: "RUNTIME_INVALID",
  CLI_NOT_AVAILABLE: "CLI_NOT_AVAILABLE",
  GATEWAY_START_FAILED: "GATEWAY_START_FAILED",
  GATEWAY_TIMEOUT: "GATEWAY_TIMEOUT",
  GATEWAY_UNREACHABLE: "GATEWAY_UNREACHABLE",
  GATEWAY_AUTH_FAILED: "GATEWAY_AUTH_FAILED",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  PROVIDER_AUTH_FAILED: "PROVIDER_AUTH_FAILED",
  CHAT_REQUEST_FAILED: "CHAT_REQUEST_FAILED",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  MANAGED_RUNTIME_RESTART_REQUIRED: "MANAGED_RUNTIME_RESTART_REQUIRED",
} as const;

export type RuntimeErrorCode =
  (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES];

export function runtimeErrorMessage(code: RuntimeErrorCode): string {
  switch (code) {
    case "RUNTIME_NOT_FOUND":
      return "Hermes Agent runtime was not found on this machine.";
    case "RUNTIME_INVALID":
      return "Hermes Agent runtime directory structure is invalid.";
    case "CLI_NOT_AVAILABLE":
      return "Hermes CLI is not available.";
    case "GATEWAY_START_FAILED":
      return "Failed to start Hermes Gateway.";
    case "GATEWAY_TIMEOUT":
      return "Hermes Gateway did not become healthy in time.";
    case "GATEWAY_UNREACHABLE":
      return "Hermes Gateway is unreachable.";
    case "GATEWAY_AUTH_FAILED":
      return "Hermes Gateway authentication failed.";
    case "PROFILE_NOT_FOUND":
      return "The selected Hermes profile was not found.";
    case "MODEL_UNAVAILABLE":
      return "The current model is unavailable.";
    case "PROVIDER_AUTH_FAILED":
      return "Provider credentials are invalid.";
    case "CHAT_REQUEST_FAILED":
      return "Chat request failed.";
    case "CONFIGURATION_ERROR":
      return "Hermes runtime configuration is invalid.";
    case "MANAGED_RUNTIME_RESTART_REQUIRED":
      return "Hermes Gateway is managed by the endpoint management service.";
    default:
      return "Unknown runtime error.";
  }
}
