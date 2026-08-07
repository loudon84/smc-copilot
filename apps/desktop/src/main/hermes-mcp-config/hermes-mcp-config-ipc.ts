import { ipcMain } from "electron";
import type {
  HermesMcpListToolsResult,
  HermesMcpServerMutationResult,
  HermesMcpServerView,
  HermesMcpTestServerResult,
  SaveHermesMcpServerInput,
} from "../../shared/hermes-mcp-config/hermes-mcp-config-contract";
import {
  listHermesMcpServers,
  listHermesMcpTools,
  reloadHermesMcpConfig,
  removeHermesMcpServer,
  saveHermesMcpServer,
  setHermesMcpServerEnabled,
  testHermesMcpServer,
} from "./hermes-mcp-config-service";

async function enableServer(name: string, profile?: string): Promise<HermesMcpServerMutationResult> {
  return setHermesMcpServerEnabled(name, true, profile);
}

async function disableServer(name: string, profile?: string): Promise<HermesMcpServerMutationResult> {
  return setHermesMcpServerEnabled(name, false, profile);
}

export function registerHermesMcpConfigIpc(): void {
  ipcMain.handle(
    "hermes-mcp:get-servers",
    async (_event, profile?: string): Promise<HermesMcpServerView[]> => listHermesMcpServers(profile),
  );

  ipcMain.handle(
    "hermes-mcp:save-server",
    async (_event, input: SaveHermesMcpServerInput): Promise<HermesMcpServerMutationResult> =>
      saveHermesMcpServer(input),
  );

  ipcMain.handle(
    "hermes-mcp:remove-server",
    async (_event, name: string, profile?: string): Promise<HermesMcpServerMutationResult> =>
      removeHermesMcpServer(name, profile),
  );

  ipcMain.handle(
    "hermes-mcp:enable-server",
    async (_event, name: string, profile?: string): Promise<HermesMcpServerMutationResult> =>
      enableServer(name, profile),
  );

  ipcMain.handle(
    "hermes-mcp:disable-server",
    async (_event, name: string, profile?: string): Promise<HermesMcpServerMutationResult> =>
      disableServer(name, profile),
  );

  ipcMain.handle(
    "hermes-mcp:test-server",
    async (_event, name: string, profile?: string): Promise<HermesMcpTestServerResult> =>
      testHermesMcpServer(name, profile),
  );

  ipcMain.handle(
    "hermes-mcp:reload",
    async (_event, profile?: string) => reloadHermesMcpConfig(profile),
  );

  ipcMain.handle(
    "hermes-mcp:list-tools",
    async (_event, name: string, profile?: string): Promise<HermesMcpListToolsResult> =>
      listHermesMcpTools(name, profile),
  );
}
