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

/**
 * In-module top tabs for the six Knowledge pages (Memory tab pattern).
 * Route scope only — never writes window URL.
 */
export function KnowledgeModuleNav({
  page,
  onNavigate,
}: KnowledgeModuleNavProps): ReactElement {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("knowledge.nav.label")}
      className="memory-tabs knowledge-module-nav"
      data-testid="knowledge-module-nav"
    >
      {KNOWLEDGE_ROUTE_PAGES.map((navPage) => {
        const active = navPage === page;
        const Icon = NAV_ICON[navPage];
        return (
          <button
            key={navPage}
            type="button"
            className={`memory-tab ${active ? "active" : ""}`}
            data-testid={`knowledge-nav-${navPage}`}
            data-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
            disabled={!onNavigate}
            onClick={() => {
              if (!onNavigate) return;
              onNavigate({ page: navPage, params: {} });
            }}
          >
            <Icon size={14} />
            {t(NAV_LABEL_KEY[navPage])}
          </button>
        );
      })}
    </nav>
  );
}

export default KnowledgeModuleNav;
