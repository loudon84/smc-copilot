import { ipcRenderer } from "electron";
import type { HermesMcpConfigAPI } from "../shared/hermes-mcp-config/hermes-mcp-config-contract";

export const hermesMcpConfigApi: HermesMcpConfigAPI = {
  getServers: (profile) => ipcRenderer.invoke("hermes-mcp:get-servers", profile),
  saveServer: (input) => ipcRenderer.invoke("hermes-mcp:save-server", input),
  removeServer: (name, profile) => ipcRenderer.invoke("hermes-mcp:remove-server", name, profile),
  enableServer: (name, profile) => ipcRenderer.invoke("hermes-mcp:enable-server", name, profile),
  disableServer: (name, profile) => ipcRenderer.invoke("hermes-mcp:disable-server", name, profile),
  testServer: (name, profile) => ipcRenderer.invoke("hermes-mcp:test-server", name, profile),
  reload: (profile) => ipcRenderer.invoke("hermes-mcp:reload", profile),
  listTools: (name, profile) => ipcRenderer.invoke("hermes-mcp:list-tools", name, profile),
};
