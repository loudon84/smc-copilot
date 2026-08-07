import { lazy, type ComponentType } from "react";
import { ChatPanel } from "../panels/ChatPanel";
import type { NavItemKey } from "../constants";

interface PageComponentProps {
  [key: string]: unknown;
}

const SessionsPage = lazy(() => import("../pages/Sessions/SessionsWorkbench"));
const SkillsPage = lazy(() => import("../pages/Skills/Skills"));
const ToolsPage = lazy(() => import("../pages/Tools/Tools"));
const MemoryPage = lazy(() => import("../pages/Memory/Memory"));
const ProvidersPage = lazy(() => import("../pages/Providers/Providers"));
const ModelsPage = lazy(() => import("../pages/Models/Models"));

export const WORKSPACE_PAGE_REGISTRY: Record<
  NavItemKey,
  ComponentType<PageComponentProps>
> = {
  chat: ChatPanel as ComponentType<PageComponentProps>,
  sessions: SessionsPage,
  skills: SkillsPage,
  tools: ToolsPage,
  memory: MemoryPage,
  providers: ProvidersPage,
  models: ModelsPage,
};

export const WORKSPACE_PAGE_KEYS = Object.keys(WORKSPACE_PAGE_REGISTRY) as NavItemKey[];
