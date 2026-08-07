import type { WorkOutput } from "../../../../../shared/work/work-output-contract";

export const MOCK_OUTPUTS: WorkOutput[] = [
  {
    id: "out-report-001",
    taskId: "task-mock-sales-001",
    name: "销售作战报告.md",
    type: "markdown",
    source: "agent",
    previewable: true,
    version: 1,
    createdBy: "嘉单顾问",
    createdAt: new Date().toISOString(),
    content: `# 销售作战报告

## 客户概览
**陕西天基通信科技有限责任公司** — 通信设备与系统集成服务商。

## 关键发现
1. 近期参与多个政企通信项目招标
2. 技术团队规模约 80 人，核心产品为专网通信解决方案
3. 决策链：技术总监 → 采购经理 → 总经理

## 竞品态势
- 主要竞品：华为企业通信、中兴政企方案
- 差异化机会：本地化服务响应、定制化集成

## Pipeline 建议
- 当前阶段：需求确认
- 建议下一步：安排技术交流会议

## 通话话术要点
- 开场：提及近期行业案例
- 价值主张：快速部署 + 本地运维
- 收尾：约定 POC 演示时间
`,
  },
];
