import type { HermesExpert } from "../../../types/hermes-experts";
import type { HermesExpertTeam } from "../../../types/hermes-expert-teams";

const BASE_POLICY = {
  allowedTools: ["web.search", "memory.read"],
  deniedTools: ["terminal", "filesystem.write"],
  requireApproval: ["mcp.crm.write"],
  allowedDomains: ["crm.company.com"],
};

function expert(
  partial: Pick<HermesExpert, "expertId" | "slug" | "name" | "displayName" | "description" | "profile"> &
    Partial<HermesExpert>,
): HermesExpert {
  return {
    category: "sales",
    provider: "nodeskclaw",
    version: "1.0.0",
    tags: [],
    domains: ["sales"],
    identity: {
      roleName: partial.displayName,
      soulMd: `# ${partial.displayName}\n你负责专业领域任务执行。`,
      userMd: "默认使用中文输出，结论优先，证据随后。",
      systemRules: ["不得编造事实。", "必须标注信息来源或不确定性。"],
    },
    capabilities: { skills: [], mcpServers: [], toolsets: [{ key: "web", enabled: true }] },
    memory: { mode: "isolated" },
    policy: BASE_POLICY,
    starterPrompts: [],
    installStatus: "not_installed",
    trustStatus: "untrusted",
    ...partial,
  };
}

export const MOCK_EXPERTS: HermesExpert[] = [
  expert({
    expertId: "exp_sales_customer_researcher",
    slug: "customer-researcher",
    name: "客户研究员",
    displayName: "客户研究员",
    description: "研究目标客户、组织架构、业务背景、采购意图与潜在切入点。",
    profile: { profileId: "expert.sales.customer-researcher", runtimeType: "hermes-local", port: 9601 },
    tags: ["客户调研", "线索分析", "销售准备"],
    starterPrompts: [
      { title: "研究潜在客户", prompt: "研究一个潜在客户，为我的销售电话做准备。" },
    ],
    capabilities: {
      skills: [
        {
          skillId: "skill_customer_research",
          name: "customer-research",
          version: "1.0.0",
          required: true,
          source: "nodeskclaw",
        },
      ],
      mcpServers: [
        {
          serverId: "mcp_crm",
          name: "CRM 查询服务",
          transport: "streamable_http",
          url: "https://nodeskclaw.example.com/api/v1/hermes/mcp",
          profileScoped: true,
          required: false,
          trustRequired: true,
        },
      ],
      toolsets: [{ key: "web", enabled: true }, { key: "memory", enabled: true }],
    },
  }),
  expert({
    expertId: "exp_sales_outreach_strategist",
    slug: "outreach-strategist",
    name: "外联策略师",
    displayName: "外联策略师",
    description: "制定触达话术、外联节奏与邮件策略。",
    profile: { profileId: "expert.sales.outreach-strategist", runtimeType: "hermes-local", port: 9602 },
    tags: ["外联", "邮件策略"],
    starterPrompts: [{ title: "制定外联计划", prompt: "为某客户制定一周外联节奏与话术。" }],
  }),
  expert({
    expertId: "exp_sales_competitor_analyst",
    slug: "competitor-analyst",
    name: "竞争情报分析师",
    displayName: "竞争情报分析师",
    description: "分析竞争对手、替代方案、价格风险。",
    profile: { profileId: "expert.sales.competitor-analyst", runtimeType: "hermes-local", port: 9603 },
    tags: ["竞情分析"],
    starterPrompts: [{ title: "竞品对比", prompt: "对比我们与主要竞争对手的差异与风险。" }],
  }),
  expert({
    expertId: "exp_sales_sales_forecast_analyst",
    slug: "sales-forecast-analyst",
    name: "销售预测分析师",
    displayName: "销售预测分析师",
    description: "基于 pipeline 与历史数据做销售预测与赢单概率评估。",
    profile: { profileId: "expert.sales.sales-forecast-analyst", runtimeType: "hermes-local", port: 9604 },
    tags: ["销售预测", "数据分析"],
    starterPrompts: [{ title: "季度预测", prompt: "根据当前 pipeline 给出本季度销售预测。" }],
  }),
  expert({
    expertId: "exp_sales_director",
    slug: "sales-director",
    name: "销售总监",
    displayName: "销售总监",
    description: "统筹销售策略、拆解任务并汇总团队产出。",
    profile: { profileId: "team.sales.sales-war-room.leader", runtimeType: "hermes-local", port: 9701 },
    tags: ["团队领导", "策略汇总"],
    installStatus: "not_installed",
    starterPrompts: [{ title: "攻坚策略", prompt: "制定大客户攻坚和赢单策略。" }],
  }),
];

export const MOCK_EXPERT_TEAMS: HermesExpertTeam[] = [
  {
    teamId: "team_sales_war_room",
    slug: "sales-war-room",
    name: "销售作战团队",
    displayName: "销售作战团队",
    category: "sales",
    description: "围绕客户研究、外联策略、竞争情报与销售预测形成销售作战方案。",
    version: "1.0.0",
    memberCount: 5,
    tags: ["销售作战", "客户调研", "竞情分析"],
    leader: { expertId: "exp_sales_director", roleName: "销售总监" },
    members: [
      {
        expertId: "exp_sales_customer_researcher",
        roleName: "客户研究员",
        responsibility: "研究客户背景、采购意图、关键联系人。",
        required: true,
        order: 1,
      },
      {
        expertId: "exp_sales_outreach_strategist",
        roleName: "外联策略师",
        responsibility: "制定触达话术、外联节奏与邮件策略。",
        required: true,
        order: 2,
      },
      {
        expertId: "exp_sales_competitor_analyst",
        roleName: "竞争情报分析师",
        responsibility: "分析竞争对手、替代方案、价格风险。",
        required: true,
        order: 3,
      },
      {
        expertId: "exp_sales_sales_forecast_analyst",
        roleName: "销售预测分析师",
        responsibility: "销售预测与赢单概率。",
        required: true,
        order: 4,
      },
    ],
    orchestration: {
      mode: "leader_dispatch",
      mergeStrategy: "structured_report",
      maxRounds: 2,
    },
    starterPrompts: [
      { title: "制定大客户攻坚策略", prompt: "制定大客户攻坚和赢单策略。" },
    ],
    installStatus: "not_installed",
  },
];

export const EXPERT_CATEGORIES = [
  { key: "all", labelKey: "workspaces.hermes.experts.categoryAll" },
  { key: "sales", labelKey: "workspaces.hermes.experts.categorySales" },
  { key: "procurement", labelKey: "workspaces.hermes.experts.categoryProcurement" },
  { key: "support", labelKey: "workspaces.hermes.experts.categorySupport" },
  { key: "finance", labelKey: "workspaces.hermes.experts.categoryFinance" },
  { key: "logistics", labelKey: "workspaces.hermes.experts.categoryLogistics" },
  { key: "engineering", labelKey: "workspaces.hermes.experts.categoryEngineering" },
] as const;

export const FEATURED_SCENARIOS = [
  { key: "content", labelKey: "workspaces.hermes.experts.scenarioContent" },
  { key: "sales_ops", labelKey: "workspaces.hermes.experts.scenarioSalesOps" },
  { key: "research", labelKey: "workspaces.hermes.experts.scenarioResearch" },
  { key: "competitive", labelKey: "workspaces.hermes.experts.scenarioCompetitive" },
  { key: "analytics", labelKey: "workspaces.hermes.experts.scenarioAnalytics" },
] as const;
