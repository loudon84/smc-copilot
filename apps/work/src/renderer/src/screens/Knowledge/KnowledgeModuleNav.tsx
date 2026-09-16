import { type ReactElement } from "react";
import {
  Database,
  FileText,
  Home,
  Layers,
  MessageSquare,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "../../components/useI18n";
import { Tabs } from "../../components/ui/Tabs";
import {
  KNOWLEDGE_ROUTE_PAGES,
  type KnowledgeNavigateTarget,
  type KnowledgePageId,
} from "./knowledge-route-descriptor";

const NAV_ICON: Record<KnowledgePageId, LucideIcon> = {
  home: Home,
  bases: Database,
  sets: Layers,
  documents: FileText,
  uploads: Upload,
  chat: MessageSquare,
};

const NAV_LABEL_KEY: Record<KnowledgePageId, string> = {
  home: "knowledge.nav.home",
  bases: "knowledge.nav.bases",
  sets: "knowledge.nav.sets",
  documents: "knowledge.nav.documents",
  uploads: "knowledge.nav.uploads",
  chat: "knowledge.nav.chat",
};

export type KnowledgeModuleNavProps = {
  page: KnowledgePageId;
  onNavigate?: (target: KnowledgeNavigateTarget) => void;
};

export function KnowledgeModuleNav({
  page,
  onNavigate,
}: KnowledgeModuleNavProps): ReactElement {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("knowledge.nav.label")}
      className="knowledge-module-nav"
      data-testid="knowledge-module-nav"
    >
      <Tabs
        tabs={KNOWLEDGE_ROUTE_PAGES.map((navPage) => {
          const Icon = NAV_ICON[navPage];
          return {
            id: navPage,
            label: (
              <>
                <Icon size={14} />
                {t(NAV_LABEL_KEY[navPage])}
              </>
            ),
          };
        })}
        active={page}
        onChange={(navPage) => {
          if (!onNavigate) return;
          onNavigate({ page: navPage, params: {} });
        }}
        tabTestId={(navPage) => `knowledge-nav-${navPage}`}
      />
    </nav>
  );
}

export default KnowledgeModuleNav;
