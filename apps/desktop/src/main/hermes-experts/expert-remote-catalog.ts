/**
 * Map Expert MCP Gateway root tools/list → HermesExpert / HermesExpertTeam (v6.1).
 */
import type { HermesExpert, HermesExpertTeam } from "../../shared/hermes-experts/hermes-experts-contract";
import type { HermesClientTool } from "../../shared/hermes-client/hermes-client-contract";
import { getExpertMcpClient } from "./expert-mcp-client";
import {
  mapCatalogItemToHermesExpert,
  mapCatalogItemToHermesExpertTeam,
  mapExpertMcpToolToExpert,
  mapExpertMcpToolToTeam,
  type ExpertMcpToolDescriptor,
} from "./expert-mcp-mappers";

export {
  mapExpertMcpToolToExpert,
  mapExpertMcpToolToTeam,
  type ExpertMcpToolDescriptor,
} from "./expert-mcp-mappers";

/** @deprecated Use mapExpertMcpToolToExpert — kept for tests mapping HermesClientTool shape. */
export function mapClientToolToExpert(tool: HermesClientTool, index: number): HermesExpert | null {
  const t = tool as HermesClientTool & { annotations?: Record<string, unknown> };
  return mapExpertMcpToolToExpert(
    {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: (t.annotations ?? { kind: "expert", slug: tool.name }) as Record<string, unknown>,
    },
    index,
  );
}

export async function listExpertsFromExpertMcpGateway(): Promise<{
  experts: HermesExpert[];
  mcpReached: boolean;
  error?: string;
}> {
  try {
    const catalog = await getExpertMcpClient().listCatalog();
    const experts = catalog
      .filter((item) => item.kind === "expert")
      .map((item, i) => mapCatalogItemToHermesExpert(item, i));
    return { experts, mcpReached: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { experts: [], mcpReached: false, error: message };
  }
}

export async function listTeamsFromExpertMcpGateway(): Promise<{
  teams: HermesExpertTeam[];
  mcpReached: boolean;
  error?: string;
}> {
  try {
    const catalog = await getExpertMcpClient().listCatalog();
    const teams = catalog
      .filter((item) => item.kind === "expert_team")
      .map((item) => mapCatalogItemToHermesExpertTeam(item));
    return { teams, mcpReached: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { teams: [], mcpReached: false, error: message };
  }
}

/** @deprecated Alias for Expert MCP Gateway list. */
export async function listExpertsFromMcpTools(): Promise<HermesExpert[]> {
  const result = await listExpertsFromExpertMcpGateway();
  return result.experts;
}

/** @deprecated Alias for Expert MCP Gateway list. */
export async function listTeamsFromMcpTools(): Promise<HermesExpertTeam[]> {
  const result = await listTeamsFromExpertMcpGateway();
  return result.teams;
}
