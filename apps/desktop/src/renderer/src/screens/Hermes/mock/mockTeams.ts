import type { WorkExpertTeam } from "../model/expert-team";

export const MOCK_TEAMS: WorkExpertTeam[] = [
  {
    id: "sales-combat-team",
    slug: "sales-combat-team",
    displayName: "销售作战团队",
    description: "客户研究、竞情分析、销售预测与外联策略",
    orchestration: "server_managed",
    category: "sales",
    tags: ["sales", "combat"],
    members: [
      { expertId: "customer-researcher", roleName: "客户研究员", responsibility: "客户画像", required: true, order: 1 },
      { expertId: "competitive-analyst", roleName: "竞情分析师", responsibility: "竞品分析", required: true, order: 2 },
      { expertId: "sales-forecast-analyst", roleName: "销售预测分析师", responsibility: "Pipeline 评审", required: true, order: 3 },
      { expertId: "outreach-strategist", roleName: "外联策略师", responsibility: "通话话术", required: false, order: 4 },
    ],
    status: "ready",
    riskLevel: "medium",
    starterPrompts: [
      { title: "销售电话准备", prompt: "为我的销售电话做准备，研究目标客户" },
    ],
    leaderRoleName: "嘉单顾问",
    memberCount: 5,
    skillCount: 4,
    executionMode: "remote_mcp",
  },
];
