import type { WorkTaskEvent } from "../../../../../shared/work/work-event-contract";

function ts(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** 销售作战团队完整 mock 事件序列 */
export function buildSalesCombatMockEvents(taskId: string): WorkTaskEvent[] {
  return [
    {
      id: `${taskId}-e1`,
      taskId,
      type: "task.created",
      createdAt: ts(0),
      source: "desktop",
      status: "draft",
      title: "陕西天基通信 — 销售电话准备",
    },
    {
      id: `${taskId}-e2`,
      taskId,
      type: "task.started",
      createdAt: ts(100),
      source: "desktop",
      status: "running",
    },
    {
      id: `${taskId}-e3`,
      taskId,
      type: "team.created",
      createdAt: ts(200),
      source: "nodeskclaw",
      teamName: "销售作战团队",
      taskGoal: "为销售电话做准备",
      status: "active",
      members: [
        { id: "lead", name: "嘉单顾问", role: "总控" },
        { id: "m1", name: "客户研究员", role: "客户画像" },
        { id: "m2", name: "竞情分析师", role: "竞品分析" },
        { id: "m3", name: "销售预测分析师", role: "Pipeline" },
        { id: "m4", name: "外联策略师", role: "话术" },
      ],
    },
    {
      id: `${taskId}-e4`,
      taskId,
      type: "team.plan.created",
      createdAt: ts(400),
      source: "nodeskclaw",
      planTitle: "销售作战计划",
      steps: ["客户画像研究", "竞品分析", "Pipeline 评审", "通话话术生成", "汇总报告"],
      memberAssignments: [
        { memberId: "m1", memberName: "客户研究员", subTask: "陕西天基通信客户画像" },
        { memberId: "m2", memberName: "竞情分析师", subTask: "通信行业竞品分析" },
        { memberId: "m3", memberName: "销售预测分析师", subTask: "销售漏斗评审" },
        { memberId: "m4", memberName: "外联策略师", subTask: "通话话术准备" },
      ],
      estimatedOutput: "销售作战报告.md",
    },
    {
      id: `${taskId}-e5`,
      taskId,
      type: "team.member.assigned",
      createdAt: ts(500),
      source: "nodeskclaw",
      memberId: "m1",
      memberName: "客户研究员",
      role: "客户画像",
      subTaskTitle: "陕西天基通信客户画像",
      status: "waiting",
    },
    {
      id: `${taskId}-e6`,
      taskId,
      type: "team.member.started",
      createdAt: ts(600),
      source: "nodeskclaw",
      memberId: "m1",
      memberName: "客户研究员",
      status: "running",
    },
    {
      id: `${taskId}-e7`,
      taskId,
      type: "tool.started",
      createdAt: ts(700),
      source: "mcp_gateway",
      toolCallId: "tool-1",
      toolName: "web_search",
      displayName: "网络搜索",
      status: "started",
      inputSummary: "陕西天基通信科技有限责任公司",
    },
    {
      id: `${taskId}-e8`,
      taskId,
      type: "tool.completed",
      createdAt: ts(1200),
      source: "mcp_gateway",
      toolCallId: "tool-1",
      toolName: "web_search",
      displayName: "网络搜索",
      status: "completed",
      outputSummary: "找到 12 条相关信息",
    },
    {
      id: `${taskId}-e9`,
      taskId,
      type: "team.member.completed",
      createdAt: ts(1500),
      source: "nodeskclaw",
      memberId: "m1",
      memberName: "客户研究员",
      status: "completed",
      summary: "完成客户画像：通信设备与系统集成服务商，约 80 人技术团队",
    },
    {
      id: `${taskId}-e10`,
      taskId,
      type: "team.member.started",
      createdAt: ts(1600),
      source: "nodeskclaw",
      memberId: "m2",
      memberName: "竞情分析师",
      status: "running",
    },
    {
      id: `${taskId}-e11`,
      taskId,
      type: "team.member.completed",
      createdAt: ts(2200),
      source: "nodeskclaw",
      memberId: "m2",
      memberName: "竞情分析师",
      status: "completed",
      summary: "竞品分析完成：华为、中兴为主要竞品，本地化服务是差异化机会",
    },
    {
      id: `${taskId}-e12`,
      taskId,
      type: "team.member.completed",
      createdAt: ts(2800),
      source: "nodeskclaw",
      memberId: "m3",
      memberName: "销售预测分析师",
      status: "completed",
      summary: "Pipeline 处于需求确认阶段，建议安排技术交流",
    },
    {
      id: `${taskId}-e13`,
      taskId,
      type: "team.member.completed",
      createdAt: ts(3200),
      source: "nodeskclaw",
      memberId: "m4",
      memberName: "外联策略师",
      status: "completed",
      summary: "通话话术已生成：开场案例引入 → 价值主张 → POC 约定",
    },
    {
      id: `${taskId}-e14`,
      taskId,
      type: "team.merge.started",
      createdAt: ts(3300),
      source: "nodeskclaw",
      summary: "嘉单顾问正在汇总各成员输出…",
    },
    {
      id: `${taskId}-e15`,
      taskId,
      type: "agent.message.delta",
      createdAt: ts(3400),
      source: "hermes_agent",
      participantId: "lead",
      participantName: "嘉单顾问",
      messageId: "msg-lead-1",
      content: "我已完成销售作战分析，",
    },
    {
      id: `${taskId}-e16`,
      taskId,
      type: "agent.message.delta",
      createdAt: ts(3500),
      source: "hermes_agent",
      participantId: "lead",
      participantName: "嘉单顾问",
      messageId: "msg-lead-1",
      content: "以下是针对陕西天基通信的销售准备摘要。",
    },
    {
      id: `${taskId}-e17`,
      taskId,
      type: "agent.message.completed",
      createdAt: ts(3600),
      source: "hermes_agent",
      participantId: "lead",
      participantName: "嘉单顾问",
      messageId: "msg-lead-1",
      content: "我已完成销售作战分析，以下是针对陕西天基通信的销售准备摘要。",
    },
    {
      id: `${taskId}-e18`,
      taskId,
      type: "team.merge.completed",
      createdAt: ts(3700),
      source: "nodeskclaw",
      summary: "团队输出已合并",
    },
    {
      id: `${taskId}-e19`,
      taskId,
      type: "output.created",
      createdAt: ts(3800),
      source: "nodeskclaw",
      outputId: "out-report-001",
      name: "销售作战报告.md",
      outputType: "markdown",
      previewable: true,
      content: MOCK_OUTPUT_CONTENT,
    },
    {
      id: `${taskId}-e20`,
      taskId,
      type: "task.completed",
      createdAt: ts(4000),
      source: "desktop",
      status: "completed",
    },
  ];
}

const MOCK_OUTPUT_CONTENT = `# 销售作战报告

## 客户概览
**陕西天基通信科技有限责任公司** — 通信设备与系统集成服务商。

## 关键发现
1. 近期参与多个政企通信项目招标
2. 技术团队规模约 80 人
3. 决策链：技术总监 → 采购经理 → 总经理

## 竞品态势
- 主要竞品：华为企业通信、中兴政企方案
- 差异化：本地化服务响应、定制化集成

## Pipeline 建议
- 当前阶段：需求确认
- 建议下一步：安排技术交流会议

## 通话话术要点
- 开场：提及近期行业案例
- 价值主张：快速部署 + 本地运维
- 收尾：约定 POC 演示时间
`;

export function buildUserMessageEvent(taskId: string, content: string): WorkTaskEvent {
  return {
    id: `user-${crypto.randomUUID()}`,
    taskId,
    type: "agent.message.delta",
    createdAt: new Date().toISOString(),
    source: "desktop",
    participantId: "user",
    participantName: "你",
    messageId: `user-msg-${crypto.randomUUID()}`,
    content,
    payload: { role: "user" },
  };
}
