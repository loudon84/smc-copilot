/**
 * Serve MCP adapter — Instance MCP CRUD without YAML (Phase 2).
 */
import { mcpClient } from "../copilot-runtime-client/clients/mcp-client";
import { configurationClient } from "../copilot-runtime-client/clients/configuration-client";
import { ServeInstanceAdapter } from "./ServeInstanceAdapter";
import type { ServeMcpServerView } from "../../shared/copilot-runtime/instance-contract";
import { asRecord, pickString } from "../../shared/copilot-runtime/instance-contract";

export const ServeMcpAdapter = {
  name: "ServeMcpAdapter" as const,

  get ready(): boolean {
    return ServeInstanceAdapter.ready;
  },

  async list(profileRef?: string): Promise<ServeMcpServerView[]> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return mcpClient.list(instanceId);
  },

  async save(
    profileRef: string | undefined,
    input: {
      name: string;
      enabled?: boolean;
      url?: string;
      token?: string;
      timeout?: number;
      headers?: Record<string, string>;
      toolsInclude?: string[];
    },
  ): Promise<ServeMcpServerView> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    const body: Record<string, unknown> = {
      name: input.name,
      enabled: input.enabled ?? true,
    };
    if (input.url !== undefined) body.url = input.url;
    if (input.token !== undefined) body.token = input.token;
    if (input.timeout !== undefined) body.timeout = input.timeout;
    if (input.headers !== undefined) body.headers = input.headers;
    if (input.toolsInclude !== undefined) body.tools = { include: input.toolsInclude };

    let existing: ServeMcpServerView | null = null;
    try {
      const servers = await mcpClient.list(instanceId);
      existing = servers.find((s) => s.name === input.name || s.serverId === input.name) ?? null;
    } catch {
      existing = null;
    }

    const raw = existing
      ? await mcpClient.put(instanceId, existing.serverId || existing.name, body)
      : await mcpClient.create(instanceId, body);
    const obj = asRecord(raw);
    return {
      serverId: pickString(obj, "serverId", "server_id", "id", "name") ?? input.name,
      name: pickString(obj, "name") ?? input.name,
      enabled: obj.enabled !== false,
      url: pickString(obj, "url") ?? input.url ?? null,
      tokenConfigured: Boolean(obj.tokenConfigured ?? obj.token_configured ?? Boolean(input.token)),
      status: obj.enabled === false ? "disabled" : "enabled",
      lastError: pickString(obj, "lastError", "last_error"),
    };
  },

  async remove(name: string, profileRef?: string): Promise<void> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    await mcpClient.delete(instanceId, name);
  },

  async enable(name: string, profileRef?: string): Promise<void> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    await mcpClient.enable(instanceId, name);
  },

  async disable(name: string, profileRef?: string): Promise<void> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    await mcpClient.disable(instanceId, name);
  },

  async test(name: string, profileRef?: string): Promise<unknown> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    return mcpClient.test(instanceId, name);
  },

  async reload(profileRef?: string): Promise<void> {
    const instanceId = await ServeInstanceAdapter.resolveInstanceId(profileRef);
    await configurationClient.reload(instanceId);
  },
};
