import type { WorkTaskPermissionMode } from "../../../../../shared/work/work-task-contract";
import type { WorkContextRef } from "../../../../../shared/work/work-context-contract";

export type WorkTaskMessageContext = {
  title: string;
  userPrompt: string;
  teamName?: string;
  expertNames?: string[];
  skillNames?: string[];
  appNames?: string[];
  permissionMode: WorkTaskPermissionMode;
  contextRefs?: WorkContextRef[];
};

const PERMISSION_LABELS: Record<WorkTaskPermissionMode, string> = {
  default: "默认权限（低风险自动允许，高风险确认）",
  confirm_each: "每次确认（所有工具调用前确认）",
  auto_low_risk: "自动执行（当前任务允许低风险自动执行）",
};

export function buildWorkTaskFirstMessage(ctx: WorkTaskMessageContext): string {
  const lines: string[] = [
    "[Work 任务]",
    `标题：${ctx.title}`,
    "来源：Work 专家工作台",
    "",
    "[任务目标]",
    ctx.userPrompt,
  ];

  if (ctx.teamName) {
    lines.push("", "[专家团队]", ctx.teamName);
    lines.push(
      "",
      "请以该专家团队的方式组织任务。如需调用远程专家或 MCP Skill，请按当前可用工具执行。",
    );
  }

  if (ctx.expertNames?.length) {
    lines.push("", "[专家]", ctx.expertNames.join("、"));
  }

  if (ctx.skillNames?.length) {
    lines.push("", "[技能]", ctx.skillNames.join("、"));
  }

  if (ctx.appNames?.length) {
    lines.push("", "[适用应用]", ctx.appNames.join("、"));
  }

  lines.push("", "[权限策略]", PERMISSION_LABELS[ctx.permissionMode]);

  if (ctx.contextRefs?.length) {
    lines.push("", "[上下文]");
    for (const ref of ctx.contextRefs) {
      lines.push(`- ${ref.title ?? ref.type}: ${ref.ref ?? ref.id}`);
    }
  }

  return lines.join("\n");
}

export function deriveTaskTitle(prompt: string): string {
  const line = prompt.trim().split(/\n/)[0] ?? "新任务";
  return line.length > 48 ? `${line.slice(0, 48)}…` : line;
}
