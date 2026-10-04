import { AcpJsonRpcTransport } from "./acp-jsonrpc-transport";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import type { RemoteExpertPermissionOption } from "../../shared/remote-expert-acp/events";

export interface AcpInitializeResult {
  protocolVersion: number;
  agentCapabilities?: {
    loadSession?: boolean;
    sessionCapabilities?: { resume?: unknown; close?: unknown };
  };
}

export class AcpClient {
  constructor(private readonly transport: AcpJsonRpcTransport) {}

  async initialize(): Promise<AcpInitializeResult> {
    const result = (await this.transport.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "smc-copilot-work", version: "remote-expert-acp" },
    })) as AcpInitializeResult;
    if (Number(result.protocolVersion) !== 1) {
      throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "initialize protocol mismatch");
    }
    if (result.agentCapabilities?.loadSession) {
      throw new RemoteExpertError("ACP_CONTRACT_INCOMPATIBLE", "loadSession must be false");
    }
    return result;
  }

  async sessionNew(cwd: string): Promise<string> {
    const result = (await this.transport.request("session/new", {
      cwd,
      mcpServers: [],
    })) as { sessionId?: string };
    if (!result.sessionId) {
      throw new RemoteExpertError("ACP_PROTOCOL_ERROR", "session/new missing sessionId");
    }
    return result.sessionId;
  }

  async sessionResume(cwd: string, sessionId: string): Promise<void> {
    await this.transport.request("session/resume", {
      cwd,
      sessionId,
      mcpServers: [],
    });
  }

  async sessionPrompt(
    sessionId: string,
    prompt: Array<Record<string, unknown>>,
  ): Promise<unknown> {
    return this.transport.request("session/prompt", { sessionId, prompt }, 300_000);
  }

  sessionCancel(sessionId: string): void {
    this.transport.notify("session/cancel", { sessionId });
  }

  async sessionClose(sessionId: string): Promise<void> {
    await this.transport.request("session/close", { sessionId });
  }

  respondPermission(id: string | number, optionId: RemoteExpertPermissionOption): void {
    this.transport.respond(id, {
      outcome: { outcome: "selected", optionId },
    });
  }
}
