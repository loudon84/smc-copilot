import type { HermesPanelPageContext } from "../../../components/hermes";

const DEFAULT_USER_PROMPT =
  "请分析当前页面内容，提取关键业务信息、风险点、可执行动作。";

const HOST_FORM_FILL_INSTRUCTION = `[表单写回要求]
当你已提取出可写入当前 Web 页面表单的数据时，必须在回复末尾输出如下格式的代码块（语言标记必须是 host_form_fill，不要用 json）：

\`\`\`host_form_fill
{
  "type": "host.form.fill",
  "formType": "product",
  "action": "create",
  "fields": { "sku": "...", "brand": "...", "model": "..." },
  "subTables": {}
}
\`\`\`

输出要求：
1. JSON 必须可被 JSON.parse；fields 必须是对象，不能省略。
2. type 固定为 host.form.fill。
3. formType 使用当前 HostBridge formType；没有时使用 product。
4. action 使用当前 task action；没有时使用 create。
5. 不要把商品字段直接平铺在根级；必须放在 fields 内。
6. subTables 没有数据时输出空对象 {}。
7. 不要要求 callbackURL；不要指导用户在 F12 控制台手动执行。
8. 不要声明你已经调用 host.form.fill；实际写回由桌面端「写回当前表单」按钮完成。`;

export function buildTaskFirstMessage(input: {
  pageUrl: string;
  pageContext: HermesPanelPageContext;
  userPrompt?: string;
  skill?: string;
  sessionId?: string | null;
  hostBridge?: {
    requestId: string;
    formType: string;
    action: "create" | "edit" | "view" | "analytic";
    callbackUrl?: string;
    skillName: string;
  };
}): string {
  const { pageUrl, pageContext, userPrompt, skill, sessionId, hostBridge } = input;
  const body =
    pageContext.payload.textExcerpt?.trim() ||
    pageContext.payload.htmlExcerpt?.trim() ||
    "";

  const hostBridgeParamsJson = hostBridge
    ? `[SkillParamsJSON]\n${JSON.stringify(
        {
          requestId: hostBridge.requestId,
          formType: hostBridge.formType,
          action: hostBridge.action,
          callbackURL: hostBridge.callbackUrl ?? "",
          skillName: hostBridge.skillName,
        },
        null,
        2,
      )}`
    : "";

  const hostBridgeBlock = hostBridge
    ? `[HostBridge]
requestId: ${hostBridge.requestId}
formType: ${hostBridge.formType}
action: ${hostBridge.action}
skillName: ${hostBridge.skillName}

${hostBridgeParamsJson}

${HOST_FORM_FILL_INSTRUCTION}

`
    : "";

  return `${hostBridgeBlock}[技能]
${skill?.trim() || "default"}

[会话]
${sessionId ?? "new"}

[页面 URL]
${pageUrl}

[页面摘要]
${pageContext.summary}

[页面内容]
${body}

[用户补充要求]
${userPrompt?.trim() || DEFAULT_USER_PROMPT}`;
}
