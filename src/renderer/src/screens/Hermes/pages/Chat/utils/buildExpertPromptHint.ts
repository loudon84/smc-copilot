export interface ExpertPromptHintInput {
  userMessage: string;
  expertName?: string;
  expertId?: string;
  skillName?: string;
  mcpServerName?: string;
  permissionMode?: "default" | "readonly" | "write" | "ask_each_time";
  outputPreference?: "markdown" | "docx" | "pdf";
}

const DEFAULT_MCP_SERVER = "nodeskclaw_expert_gateway";

function mapPermissionMode(mode: ExpertPromptHintInput["permissionMode"]): string {
  if (mode === "readonly") return "只读";
  if (mode === "write") return "可写";
  if (mode === "ask_each_time") return "每次确认";
  return "默认";
}

export function buildExpertPromptHint(input: ExpertPromptHintInput): string {
  const mcpServer = input.mcpServerName?.trim() || DEFAULT_MCP_SERVER;
  const skillName = input.skillName?.trim() ?? "";
  const expertLabel = input.expertName?.trim() || input.expertId?.trim() || "已选专家";
  const permission = mapPermissionMode(input.permissionMode);
  const outputPref = input.outputPreference ?? "markdown";

  return [
    `请优先使用已配置的 Hermes MCP Server「${mcpServer}」中的 expert skill「${skillName}」完成任务。`,
    "",
    "执行要求：",
    "1. 通过 hermes-agent 内部 MCP Client 调用工具。",
    "2. 不要求 desktop 直接调用任何远端 Expert Gateway。",
    "3. 如果工具返回过程信息，请以工具进度形式展示。",
    `4. 如果生成报告，请保存到当前 Hermes workspace，优先 ${outputPref} 格式。`,
    "5. 最终回答必须包含生成文档的本地路径。",
    "",
    `专家：${expertLabel}`,
    `权限模式：${permission}`,
    "",
    "用户任务：",
    input.userMessage.trim(),
  ].join("\n");
}

export function shouldBuildExpertPromptHint(input: {
  expertName?: string | null;
  skillName?: string | null;
}): boolean {
  return Boolean(input.expertName?.trim() && input.skillName?.trim());
}
