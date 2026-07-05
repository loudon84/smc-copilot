# Current Agent State

| Stage | Status |
|---|---|
| v7.6-hermes-agent-mcp-host-mode | done |

## Notes

**v7.6 Hermes Agent MCP Host Mode**（PRD `prd_work/v7.6_agent-host-mode.md`）：

- Chat 移除 `useExpertGateway` 分叉；Expert+Skill → `buildExpertPromptHint` → 统一 `hermesDefaultChat.sendMessage`
- 新增 `hermes-mcp-config` Main/Preload/Shared + `window.hermesMcpConfig`
- McpGateway 页新增 `HermesAgentMcpServersPanel` 写 `config.yaml` `mcp_servers`
- Chat UI：`PromptHintPreview` / `ToolProgressTimeline` / `LocalDocumentCard`
- Legacy `useRuntimeSkillSend` / `useExpertTaskStream` / `callExpertSkill` 标记 @deprecated
