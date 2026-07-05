import type { SaveHermesMcpServerInput } from "../../shared/hermes-mcp-config/hermes-mcp-config-contract";

export const DEFAULT_EXPERT_MCP_SERVER = "nodeskclaw_expert_gateway";

export const DEFAULT_EXPERT_MCP_ENV = {
  url: "NODESKCLAW_EXPERT_MCP_URL",
  token: "NODESKCLAW_EXPERT_MCP_TOKEN",
  desktopId: "COPILOT_DESKTOP_ID",
} as const;

export type HermesMcpServerYamlEntry = {
  enabled?: boolean;
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
  tools?: {
    include?: string[];
  };
};

export function validateSaveHermesMcpServerInput(input: SaveHermesMcpServerInput): string | null {
  const name = input.name?.trim();
  if (!name) return "Server name is required";
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return "Server name must contain only letters, numbers, underscore or hyphen";
  }
  if (input.timeout != null && (input.timeout < 1 || input.timeout > 3600)) {
    return "Timeout must be between 1 and 3600 seconds";
  }
  return null;
}
