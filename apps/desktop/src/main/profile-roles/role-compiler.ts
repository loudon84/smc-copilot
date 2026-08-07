import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  writeTextFile,
  copySourceMarkdown,
  destPathForSource,
  roleSourceSkillRelPath,
} from "./role-file-writer";

export interface CompileProfileRoleInput {
  profileName: string;
  displayName: string;
  port: number;
  profileHome: string;
  roleKey: string;
  roleName: string;
  roleSummary?: string;
  sourceRepo: string;
  sourceRoot: string;
  sourcePaths: string[];
}

export interface CompileProfileRoleResult {
  soulPath: string;
  memoryPath: string;
  manifestPath: string;
  checksum: string;
  copiedSourceFiles: string[];
  copiedSourceRelPaths: string[];
  generatedFiles: string[];
}

const DELEGATION_LINES: Record<string, string[]> = {
  writer: [
    "涉及代码实现时，应委派给 engineer-9612。",
    "涉及市场数据研究时，应委派给 research-9602。",
    "涉及财务测算时，应委派给 finance-9631。",
    "涉及客户拓展时，应委派给 sales-9641。",
  ],
  engineer: [
    "涉及写作生文时，应委派给 writer-9601。",
    "涉及市场数据研究时，应委派给 research-9602。",
    "涉及招聘流程时，应委派给 hurman-9621。",
    "涉及财务测算时，应委派给 finance-9631。",
  ],
  research: [
    "涉及写作生文时，应委派给 writer-9601。",
    "涉及代码实现时，应委派给 engineer-9612。",
    "涉及财务测算时，应委派给 finance-9631。",
    "涉及客户拓展时，应委派给 sales-9641。",
  ],
  hurman: [
    "涉及写作生文时，应委派给 writer-9601。",
    "涉及代码实现时，应委派给 engineer-9612。",
    "涉及市场数据研究时，应委派给 research-9602。",
  ],
  finance: [
    "涉及写作生文时，应委派给 writer-9601。",
    "涉及代码实现时，应委派给 engineer-9612。",
    "涉及市场数据研究时，应委派给 research-9602。",
    "涉及客户拓展时，应委派给 sales-9641。",
  ],
  sales: [
    "涉及写作生文时，应委派给 writer-9601。",
    "涉及市场数据研究时，应委派给 research-9602。",
    "涉及财务测算时，应委派给 finance-9631。",
    "涉及代码实现时，应委派给 engineer-9612。",
  ],
};

const DEFAULT_DELIVERABLES: Record<string, string[]> = {
  writer: ["内容模板", "生文提示词", "长文大纲", "多平台改写版本", "内容日历", "数据复盘清单"],
  engineer: ["技术方案", "代码片段", "Skill 包说明", "集成步骤", "测试清单"],
  research: ["研究报告", "数据摘要", "趋势分析", "投放/搜索词洞察", "机会清单"],
  hurman: ["JD 模板", "简历筛选标准", "面试流程", "Offer 检查清单", "招聘看板指标"],
  finance: ["财务模型", "预测表", "差异分析", "KPI 仪表盘说明", "预算建议"],
  sales: ["客户拓展计划", "QBR 大纲", "干系人图谱", "客户健康报告", "增长行动项"],
};

function hashSources(sourceRoot: string, sourcePaths: string[]): string {
  const hash = createHash("sha256");
  for (const rel of sourcePaths) {
    const full = join(sourceRoot, rel);
    if (existsSync(full)) {
      hash.update(rel);
      hash.update(readFileSync(full, "utf-8"));
    }
  }
  return hash.digest("hex");
}

function buildSoulMarkdown(input: CompileProfileRoleInput): string {
  const sourceLines = input.sourcePaths.map((p) => `- agency-agents-zh/${p}`);
  const delegation = DELEGATION_LINES[input.roleKey] ?? [];
  const deliverables = DEFAULT_DELIVERABLES[input.roleKey] ?? ["结构化交付物清单"];

  const trimmedSummary = input.roleSummary?.trim();
  const summary = trimmedSummary
    ? trimmedSummary.startsWith("你是")
      ? trimmedSummary
      : `你是 Hermes Desktop 中的${input.roleName}，负责${trimmedSummary.replace(/[。.]$/, "")}。`
    : `你是 Hermes Desktop 中的${input.roleName}。`;

  return [
    `# ${input.roleName}`,
    "",
    "## 身份",
    summary,
    "",
    "## 角色来源",
    ...sourceLines,
    "",
    "## 工作边界",
    ...delegation.map((line) => `- ${line}`),
    "",
    "## 默认交付物",
    ...deliverables.map((d) => `- ${d}`),
    "",
  ].join("\n");
}

function buildMemoryMarkdown(input: CompileProfileRoleInput): string {
  return [
    `# ${input.roleName} — 记忆`,
    "",
    `Profile: ${input.profileName}`,
    `Role key: ${input.roleKey}`,
    "",
    "§",
    "初始记忆：由 Hermes Desktop 专家预设安装生成。",
    "§",
    "",
  ].join("\n");
}

export function compileProfileRole(input: CompileProfileRoleInput): CompileProfileRoleResult {
  const copiedSourceFiles: string[] = [];
  const copiedSourceRelPaths: string[] = [];
  const generatedFiles: string[] = [];

  for (const rel of input.sourcePaths) {
    const src = join(input.sourceRoot, rel);
    if (!existsSync(src)) {
      throw new Error(`Role source file not found: ${src}`);
    }
    const dest = destPathForSource(input.profileHome, rel);
    copySourceMarkdown(src, dest);
    copiedSourceFiles.push(dest);
    copiedSourceRelPaths.push(roleSourceSkillRelPath(rel));
  }

  const checksum = hashSources(input.sourceRoot, input.sourcePaths);
  const soulPath = join(input.profileHome, "SOUL.md");
  const memoryPath = join(input.profileHome, "MEMORY.md");
  const manifestPath = join(input.profileHome, "profile-role.json");

  writeTextFile(soulPath, buildSoulMarkdown(input));
  generatedFiles.push(soulPath);

  writeTextFile(memoryPath, buildMemoryMarkdown(input));
  generatedFiles.push(memoryPath);

  const manifest = {
    profile: input.profileName,
    port: input.port,
    roleKey: input.roleKey,
    roleName: input.roleName,
    sourceRepo: input.sourceRepo,
    sourcePaths: input.sourcePaths,
    generatedFiles: ["SOUL.md", "MEMORY.md", ...copiedSourceRelPaths],
    checksum,
    installedAt: new Date().toISOString(),
  };

  writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
  generatedFiles.push(manifestPath);

  return {
    soulPath,
    memoryPath,
    manifestPath,
    checksum,
    copiedSourceFiles,
    copiedSourceRelPaths,
    generatedFiles,
  };
}
