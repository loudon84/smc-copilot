import { lazy, type ComponentType } from "react";
import type { HermesNavItemKey } from "../constants";
import type { HermesPageDefinition, HermesPageSection } from "../model/page";

const SessionsPage = lazy(() => import("../pages/Sessions/HermesSessionsPage"));
const SkillsPage = lazy(() => import("../pages/Skills/HermesSkillsPage"));
const ToolsPage = lazy(() => import("../pages/Tools/HermesToolsPage"));
const MemoryPage = lazy(() => import("../pages/Memory/HermesMemoryPage"));
const ProvidersPage = lazy(() => import("../pages/Providers/HermesProvidersPage"));
const ModelsPage = lazy(() => import("../pages/Models/HermesModelsPage"));
const ChatPage = lazy(() => import("../pages/Chat/HermesDefaultChatPage"));
const TasksPage = lazy(() => import("../pages/Tasks/WorkTasksPage"));
const WorkbenchPage = lazy(() => import("../pages/Workbench/HermesWorkbenchPage"));
const ExpertsPage = lazy(() => import("../pages/Experts/HermesExpertsPage"));
const ExpertTeamsPage = lazy(() => import("../pages/ExpertTeams/HermesExpertTeamsPage"));
const ExpertRunsPage = lazy(() => import("../pages/ExpertRuns/HermesExpertRunsPage"));
const ArtifactsPage = lazy(() => import("../pages/Artifacts/HermesArtifactsPage"));
const McpPage = lazy(() => import("../pages/MCP/HermesMCPPage"));
const McpGatewayPage = lazy(() => import("../pages/McpGateway/HermesMcpGatewayPage"));
const GeneHubSkillCenterPage = lazy(() => import("../pages/GeneHub/GeneHubSkillCenterPage"));

export type { HermesPageDefinition, HermesPageSection } from "../model/page";
export type HermesPageKey = HermesNavItemKey;

type PageComponentMap = Record<HermesPageKey, ComponentType>;

const PAGE_COMPONENTS: PageComponentMap = {
  tasks: TasksPage,
  workbench: WorkbenchPage,
  chat: ChatPage,
  experts: ExpertsPage,
  expertTeams: ExpertTeamsPage,
  expertRuns: ExpertRunsPage,
  artifacts: ArtifactsPage,
  sessions: SessionsPage,
  skills: SkillsPage,
  skillCenter: GeneHubSkillCenterPage,
  mcp: McpPage,
  mcpGateway: McpGatewayPage,
  tools: ToolsPage,
  memory: MemoryPage,
  providers: ProvidersPage,
  models: ModelsPage,
};

/** @deprecated Prefer HERMES_PAGE_DEFINITIONS — kept for HermesShell page loader */
export const HERMES_PAGE_REGISTRY: Record<HermesPageKey, ComponentType> = PAGE_COMPONENTS;

export function buildHermesPageDefinitions(
  navItems: ReadonlyArray<{
    key: HermesNavItemKey;
    labelI18nKey: string;
    icon: string;
    section: HermesPageSection;
    visible?: boolean;
    requiresGateway?: boolean;
  }>,
): HermesPageDefinition[] {
  return navItems
    .filter((item) => item.visible !== false)
    .map((item) => ({
      ...item,
      component: PAGE_COMPONENTS[item.key],
    }));
}
