/**
 * PRD v1.6 — Main-only Runtime client helpers for Chat capability closure.
 * Renderer must use window.copilotRuntime (never fetch Runtime URL directly).
 */

import { getSmcRuntimeClient } from "../copilot-runtime-client/smc-runtime-client";
import { ServeInstanceAdapter } from "../runtime-adapters/ServeInstanceAdapter";

async function resolveInstanceId(profileRef?: string): Promise<string | null> {
  try {
    const ref = profileRef && profileRef.trim() ? profileRef : "default";
    const resolved = await ServeInstanceAdapter.resolveRef(ref);
    if (resolved?.instanceId) return resolved.instanceId;
  } catch {
    /* fall through */
  }
  try {
    const list = await ServeInstanceAdapter.list();
    const match = list.find(
      (i) =>
        i.profileRef === profileRef ||
        i.name === profileRef ||
        ((!profileRef || profileRef === "default") &&
          (i.profileRef === "default" || i.name === "default")),
    );
    return match?.instanceId ?? list[0]?.instanceId ?? null;
  } catch {
    return null;
  }
}

export const ChatCapabilityRuntime = {
  resolveInstanceId,

  async listSessions(profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) return [];
    return getSmcRuntimeClient().sessions.listByInstance(instanceId);
  },

  async listMessages(sessionId: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) return [];
    return getSmcRuntimeClient().sessions.listMessages(instanceId, sessionId);
  },

  async listFiles(sessionId: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) return { files: [] };
    return getSmcRuntimeClient().sessions.listFiles(instanceId, sessionId);
  },

  async searchFiles(sessionId: string, query: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) return { hits: [] };
    return getSmcRuntimeClient().sessions.searchFiles(instanceId, sessionId, query);
  },

  async addFileContext(sessionId: string, fileId: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) throw new Error("Runtime instance unavailable");
    return getSmcRuntimeClient().sessions.addFileContext(instanceId, sessionId, fileId);
  },

  async removeFileContext(sessionId: string, fileId: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) throw new Error("Runtime instance unavailable");
    return getSmcRuntimeClient().sessions.removeFileContext(instanceId, sessionId, fileId);
  },

  async getChatSettings(sessionId: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) return null;
    return getSmcRuntimeClient().sessions.getChatSettings(instanceId, sessionId);
  },

  async patchChatSettings(
    sessionId: string,
    body: { modelId?: string | null; contextFolder?: string | null },
    profileRef?: string,
  ) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) throw new Error("Runtime instance unavailable");
    return getSmcRuntimeClient().sessions.patchChatSettings(instanceId, sessionId, body);
  },

  async listChatCommands(profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) return { commands: [], rpcReady: false };
    return getSmcRuntimeClient().sessions.listChatCommands(instanceId);
  },

  async listWorkspace(sessionId: string, path?: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) throw new Error("Runtime instance unavailable");
    return getSmcRuntimeClient().sessions.listWorkspace(instanceId, sessionId, path);
  },

  async readWorkspaceFile(sessionId: string, path: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) throw new Error("Runtime instance unavailable");
    return getSmcRuntimeClient().sessions.readWorkspaceFile(instanceId, sessionId, path);
  },

  async workspaceTerminalPath(sessionId: string, profileRef?: string) {
    const instanceId = await resolveInstanceId(profileRef);
    if (!instanceId) throw new Error("Runtime instance unavailable");
    return getSmcRuntimeClient().sessions.workspaceTerminalPath(instanceId, sessionId);
  },

  async executeCommand(
    runId: string,
    body: { turnId?: string; sessionId?: string; name: string; args?: string },
  ) {
    return getSmcRuntimeClient().chat.executeCommand(runId, body);
  },

  async createBackgroundTurn(
    runId: string,
    body: { parentTurnId?: string; sessionId?: string; message: string },
  ) {
    return getSmcRuntimeClient().chat.createBackgroundTurn(runId, body);
  },
};
