# MCP and experts

Desktop runs a local MCP Skill Gateway proxy, GeneHub skill sync, and Expert MCP clients. Tokens for remote MCP stay in Main; Renderer sees health and masked config only.

Chat policy: [[decisions#Chat must not bypass Hermes MCP host mode]].

## MCP Skill Gateway

Local proxy (default profile-scoped URL) forwards to nodeskclaw Hermes MCP endpoints and injects Bearer only inside the proxy. Hermes Agent registers `mcp_servers` (including skill gateway) via config managed from Desktop.

Operations include diagnostics, tools list/cache, invoke-test for read-only tools, structured logs, and GeneHub registration cards. Write-tool approval is server-side grant state — Desktop does not invent a local approval DB.

## Hermes Agent MCP host mode

v7.6 Chat sends through Hermes Agent as MCP host. Expert/skill context becomes prompt hints (`buildExpertPromptHint`). Chat business code must not call `nodeskclaw` Runtime Skill IPC or `callCatalogSkill` for ordinary conversation.

Config surface: `window.hermesMcpConfig` reads/writes `mcp_servers` with token masking.

## GeneHub and Experts

GeneHub syncs authorized skill bundles; Experts Workbench calls remote Expert MCP outside default Chat send.

GeneHub discovers connection info, registers device/profile, and executes Bundle install jobs with provenance checks. Experts use `/api/v1/expert/mcp` for catalog list and explicit skill calls.
