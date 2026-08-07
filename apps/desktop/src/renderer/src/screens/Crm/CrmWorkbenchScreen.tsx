import { ArrowLeft } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import {
  navigateCrmRendererRoute,
  useCrmRendererNavigation,
} from "../../crm-bridge/crm-renderer-navigation";
import { CRM_RENDERER_ROUTE_DEFINITIONS } from "../../../../shared/crm-bridge/crm-renderer-routes";
import type { View } from "../../types/desktop-shell";
import { CrmRoutePage } from "./CrmRoutePage";

export interface CrmWorkbenchScreenProps {
  enabled: boolean;
  onNavigate: (view: View) => void;
}

export function CrmWorkbenchScreen({
  enabled,
  onNavigate,
}: CrmWorkbenchScreenProps): React.JSX.Element {
  const { t } = useI18n();
  const { route, lastEvent } = useCrmRendererNavigation();

  if (!enabled) {
    return <div className="h-full min-h-0" aria-hidden />;
  }

  const activeRouteId = route?.id ?? "customer-ai";

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
          onClick={() => onNavigate("web-operator")}
        >
          <ArrowLeft size={14} />
          {t("navigation.crm.backToWebOperator")}
        </button>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {CRM_RENDERER_ROUTE_DEFINITIONS.map((def) => {
            const isActive = def.id === activeRouteId;
            return (
              <button
                key={def.id}
                type="button"
                className={`rounded px-3 py-1.5 text-sm whitespace-nowrap ${
                  isActive
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
                onClick={() => navigateCrmRendererRoute(def.path)}
              >
                {t(def.titleKey)}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CrmRoutePage routeId={activeRouteId} lastEvent={lastEvent} />
      </div>
    </div>
  );
}
