# MCP and experts

Desktop no longer runs a local MCP Agent proxy on `:18781` (PRD v1.4.1). Renderer MCP IPC goes through Main compatibility adapter to Runtime.

`window.hermesAPI.mcp` channels use Main `mcp-compat-ipc`, which delegates server CRUD/test/enable/disable to Runtime `/instances/{id}/mcp/servers*` via `ServeMcpAdapter`. Channels without Runtime equivalents return `MCP_MOVED_TO_RUNTIME` (no legacy DB/HTTP fallback).

Expert MCP Skill Gateway module may still exist for diagnostics but must not auto-listen at app ready. Tokens for remote MCP stay in Main; Renderer sees health and masked config only.

Chat policy: [[decisions#Chat must not bypass Hermes MCP host mode]].

## MCP Skill Gateway

Expert MCP Skill Gateway proxy code remains under `mcp-skill-gateway-runtime/` for optional/manual use, but v1.4+ disables automatic listen on app ready. Hermes Agent MCP servers are owned by Runtime instance config, not Desktop SQLite registry.

## Hermes Agent MCP host mode

v7.6 Chat sends through Hermes Agent as MCP host. Expert/skill context becomes prompt hints (`buildExpertPromptHint`). Chat business code must not call `nodeskclaw` Runtime Skill IPC or `callCatalogSkill` for ordinary conversation.

Config surface: `window.hermesMcpConfig` reads/writes `mcp_servers` with token masking.

## GeneHub and Experts

GeneHub syncs authorized skill bundles; Experts Workbench calls remote Expert MCP outside default Chat send.

GeneHub discovers connection info, registers device/profile, and executes Bundle install jobs with provenance checks. Experts use `/api/v1/expert/mcp` for catalog list and explicit skill calls.
