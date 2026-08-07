import { HermesExpertsError } from "../../shared/hermes-experts/hermes-experts-errors";

const FORBIDDEN_ROUTE_KEYS = new Set([
  "_routing",
  "_execution",
  "route_config",
  "profile",
  "agent_alias",
  "agentAlias",
  "runtime",
  "runtime_name",
  "runtimeName",
  "api_server_url",
  "apiServerUrl",
  "workspace_override",
  "workspaceOverride",
]);

export function assertNoRouteOverride(args: Record<string, unknown>): void {
  const rootKeys = Object.keys(args).filter((key) => FORBIDDEN_ROUTE_KEYS.has(key));

  const context = args.context;
  const contextKeys =
    context && typeof context === "object" && !Array.isArray(context)
      ? Object.keys(context as Record<string, unknown>).filter((key) =>
          FORBIDDEN_ROUTE_KEYS.has(key),
        )
      : [];

  const found = [...rootKeys, ...contextKeys];

  if (found.length > 0) {
    throw new HermesExpertsError(
      "EXPERT_ROUTE_OVERRIDE_FORBIDDEN",
      `Forbidden route override keys: ${found.join(", ")}`,
    );
  }
}

export { FORBIDDEN_ROUTE_KEYS };
