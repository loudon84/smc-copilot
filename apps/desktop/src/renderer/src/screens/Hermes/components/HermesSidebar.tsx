import { useEffect, useMemo, useState } from "react";

import {

  Activity,

  Box,

  Brain,

  ChevronDown,

  ChevronRight,

  ClipboardList,

  FileBox,

  Globe,

  History,

  LayoutDashboard,

  Library,

  MessageSquare,

  PanelLeftClose,

  PanelLeftOpen,

  Plug,

  Server,

  Sparkles,

  Users,

  UsersRound,

  Wrench,

} from "lucide-react";

import { useTranslation } from "react-i18next";

import { LAYOUT, type HermesNavItemDefinition, type HermesNavItemKey } from "../constants";

import { useHermesDefault } from "../context/HermesDefaultContext";

import { isNavItemAccessible } from "../features/nav/navItemAccess";

import { useGatewayNavGate } from "../features/nav/useGatewayNavGate";

import {

  HERMES_PAGE_SECTION_DEFAULT_COLLAPSED,

  HERMES_PAGE_SECTION_I18N,

  HERMES_PAGE_SECTIONS,

  type HermesPageSection,

} from "../model/page";



const ICONS: Record<string, typeof MessageSquare> = {

  ClipboardList,

  LayoutDashboard,

  MessageSquare,

  Users,

  UsersRound,

  Activity,

  FileBox,

  History,

  Sparkles,

  Library,

  Plug,

  Globe,

  Wrench,

  Brain,

  Server,

  Box,

};



type Props = {

  activePanel?: string;

  onPanelChange?: (panel: string) => void;

};



function readSectionCollapsed(): Record<HermesPageSection, boolean> {

  try {

    const raw = localStorage.getItem("hermesDefault.navSectionCollapsed");

    if (!raw) return { ...HERMES_PAGE_SECTION_DEFAULT_COLLAPSED };

    const parsed = JSON.parse(raw) as Partial<Record<HermesPageSection, boolean>>;

    return { ...HERMES_PAGE_SECTION_DEFAULT_COLLAPSED, ...parsed };

  } catch {

    return { ...HERMES_PAGE_SECTION_DEFAULT_COLLAPSED };

  }

}



function writeSectionCollapsed(state: Record<HermesPageSection, boolean>): void {

  try {

    localStorage.setItem("hermesDefault.navSectionCollapsed", JSON.stringify(state));

  } catch {

    /* ignore */

  }

}



export function HermesSidebar({ activePanel, onPanelChange }: Props) {

  const { t } = useTranslation();

  const {

    activeNavItem,

    setActiveNavItem,

    leftPanelCollapsed,

    setLeftPanelCollapsed,

    navItems,

  } = useHermesDefault();

  const { gatewayOnline } = useGatewayNavGate();



  const [sectionCollapsed, setSectionCollapsed] =

    useState<Record<HermesPageSection, boolean>>(readSectionCollapsed);



  const current = (activePanel as HermesNavItemKey | undefined) ?? activeNavItem;

  const sidebarCollapsed = leftPanelCollapsed;

  const width = sidebarCollapsed ? LAYOUT.sidebarCollapsedWidthPx : LAYOUT.sidebarWidthPx;

  const requiresGatewayHint = t("workspaces.nav.requiresGateway", {

    defaultValue: "Expert Gateway is offline",

  });



  const itemsBySection = useMemo(() => {

    const grouped: Record<HermesPageSection, HermesNavItemDefinition[]> = {

      primary: [],

      capability: [],

      advanced: [],

    };

    for (const item of navItems) {

      if (item.visible === false) continue;

      grouped[item.section].push(item);

    }

    return grouped;

  }, [navItems]);



  const collapsedNavItems = useMemo(

    () =>

      navItems.filter(

        (item) => item.section === "primary" && isNavItemAccessible(item, gatewayOnline),

      ),

    [navItems, gatewayOnline],

  );



  useEffect(() => {

    const activeItem = navItems.find((item) => item.key === current);

    if (!activeItem || activeItem.section === "primary") return;

    setSectionCollapsed((prev) => {

      if (!prev[activeItem.section]) return prev;

      const next = { ...prev, [activeItem.section]: false };

      writeSectionCollapsed(next);

      return next;

    });

  }, [current, navItems]);



  const select = (key: HermesNavItemKey) => {

    setActiveNavItem(key);

    onPanelChange?.(key);

  };



  const toggleSection = (section: HermesPageSection) => {

    setSectionCollapsed((prev) => {

      const next = { ...prev, [section]: !prev[section] };

      writeSectionCollapsed(next);

      return next;

    });

  };



  const renderNavButton = (item: HermesNavItemDefinition) => {

    const Icon = ICONS[item.icon] ?? MessageSquare;

    const label = t(item.labelI18nKey, { defaultValue: item.key });

    const isActive = current === item.key;

    const accessible = isNavItemAccessible(item, gatewayOnline);

    const disabledHint = item.requiresGateway && !accessible ? requiresGatewayHint : undefined;

    const title = disabledHint ?? (sidebarCollapsed ? label : undefined);



    return (

      <button

        key={item.key}

        type="button"

        className={`hermes-nav-button${isActive ? " is-active" : ""}${!accessible ? " is-disabled" : ""}`}

        title={title}

        disabled={!accessible}

        onClick={() => {

          if (accessible) select(item.key);

        }}

      >

        <Icon size={16} />

        <span className="hermes-nav-label">{label}</span>

      </button>

    );

  };



  return (

    <nav

      className={`hermes-sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}

      style={{ "--hermes-left-width": `${width}px` } as React.CSSProperties}

    >

      <div className="hermes-sidebar-toggle">

        <button

          type="button"

          onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}

          className="hermes-icon-button"

          title={

            sidebarCollapsed

              ? t("workspaces.sidebar.expand", { defaultValue: "Expand sidebar" })

              : t("workspaces.sidebar.collapse", { defaultValue: "Collapse sidebar" })

          }

        >

          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}

        </button>

      </div>

      <div className="hermes-nav-list">

        {sidebarCollapsed ? (

          collapsedNavItems.map((item) => renderNavButton(item))

        ) : (

          HERMES_PAGE_SECTIONS.map((section) => {

            const sectionItems = itemsBySection[section];

            if (sectionItems.length === 0) return null;



            const isPrimary = section === "primary";

            const collapsed = !isPrimary && sectionCollapsed[section];

            const sectionLabel = t(HERMES_PAGE_SECTION_I18N[section], {

              defaultValue: section,

            });



            return (

              <div key={section} className="hermes-nav-section">

                {!isPrimary ? (

                  <button

                    type="button"

                    className="hermes-nav-section-header"

                    onClick={() => toggleSection(section)}

                    aria-expanded={!collapsed}

                  >

                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}

                    <span>{sectionLabel}</span>

                  </button>

                ) : null}

                {!collapsed || isPrimary ? (

                  <div className="hermes-nav-section-items">

                    {sectionItems.map((item) => renderNavButton(item))}

                  </div>

                ) : null}

              </div>

            );

          })

        )}

      </div>

    </nav>

  );

}

