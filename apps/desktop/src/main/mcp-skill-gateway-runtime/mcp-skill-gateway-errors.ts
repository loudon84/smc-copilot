import type { McpSkillGatewayDesktopErrorCode } from "../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";

export class McpSkillGatewayError extends Error {
  readonly code: McpSkillGatewayDesktopErrorCode;

  constructor(code: McpSkillGatewayDesktopErrorCode, message: string) {
    super(message);
    this.name = "McpSkillGatewayError";
    this.code = code;
  }
}

export function isMcpSkillGatewayError(err: unknown): err is McpSkillGatewayError {
  return err instanceof McpSkillGatewayError;
}

export const MCP_SKILL_GATEWAY_UI_MESSAGES: Record<McpSkillGatewayDesktopErrorCode, string> = {
  MCP_GATEWAY_NOT_LOGGED_IN: "请先登录后再启用 MCP Skill Gateway。",
  MCP_GATEWAY_BACKEND_NOT_CONFIGURED: "后端地址未配置。",
  MCP_GATEWAY_BACKEND_MISMATCH: "Proxy 后端与当前登录后端不一致，请重启 Proxy。",
  MCP_GATEWAY_CONFIG_MISMATCH: "Hermes MCP 注册配置与当前 Proxy 不一致，请重新注册当前 Profile。",
  MCP_GATEWAY_PROXY_PORT_IN_USE: "本地端口已被占用，请更换端口。",
  MCP_GATEWAY_PROXY_START_FAILED: "本地 MCP Proxy 启动失败。",
  MCP_GATEWAY_PROXY_NOT_RUNNING: "本地 MCP Proxy 未运行。",
  MCP_GATEWAY_REMOTE_UNREACHABLE: "无法连接远程 MCP Skill Gateway。",
  MCP_GATEWAY_REMOTE_UNAUTHORIZED: "登录状态已失效，请重新登录。",
  MCP_GATEWAY_REMOTE_FORBIDDEN: "无权访问远程 MCP Skill Gateway。",
  MCP_GATEWAY_CONFIG_WRITE_FAILED: "写入 Hermes 配置失败，请检查目录权限。",
  MCP_GATEWAY_PROFILE_NOT_FOUND: "未找到指定 Profile。",
  MCP_GATEWAY_HERMES_RESTART_REQUIRED: "Hermes Gateway 需要重启后配置才会生效。",
  MCP_GATEWAY_INVALID_JSONRPC: "无效的 JSON-RPC 请求。",
  MCP_GATEWAY_REQUEST_TOO_LARGE: "请求体过大（最大 2MB）。",
};
