/**
 * Phase 2+ runtime adapters. Instance/Config/MCP/Diagnostics are live;
 * Chat is live (Phase 3); Session/Task/Files remain stubs until later phases.
 */
export { ServeInstanceAdapter } from "./ServeInstanceAdapter";
export { ServeConfigurationAdapter } from "./ServeConfigurationAdapter";
export { ServeMcpAdapter } from "./ServeMcpAdapter";
export { ServeDiagnosticsAdapter } from "./ServeDiagnosticsAdapter";
export { ServeChatRuntimeAdapter } from "./ServeChatRuntimeAdapter";

export const ServeSessionCatalogAdapter = {
  name: "ServeSessionCatalogAdapter" as const,
  ready: false,
};

export const ServeResourceAdapter = {
  name: "ServeResourceAdapter" as const,
  ready: false,
};

export const ServeTaskAdapter = {
  name: "ServeTaskAdapter" as const,
  ready: false,
};

export const ServeFilesAdapter = {
  name: "ServeFilesAdapter" as const,
  ready: false,
};
