import { useMemo } from "react";
import { useI18n } from "../../components/useI18n";
import type { CrmRendererRouteId } from "../../../../shared/crm-bridge/crm-renderer-routes";
import type { CrmBridgeStoredEvent } from "../../../../shared/crm-bridge";

export interface CrmRoutePageProps {
  routeId: CrmRendererRouteId;
  lastEvent: CrmBridgeStoredEvent | null;
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function CrmRoutePage({ routeId, lastEvent }: CrmRoutePageProps): React.JSX.Element {
  const { t } = useI18n();

  const titleKey =
    routeId === "customer-ai"
      ? "navigation.crm.customerAi"
      : routeId === "quote-assistant"
        ? "navigation.crm.quoteAssistant"
        : "navigation.crm.orderRisk";

  const descriptionKey =
    routeId === "customer-ai"
      ? "navigation.crm.customerAiDesc"
      : routeId === "quote-assistant"
        ? "navigation.crm.quoteAssistantDesc"
        : "navigation.crm.orderRiskDesc";

  const contextPreview = useMemo(() => {
    if (!lastEvent) return "";
    return formatJson({
      type: lastEvent.type,
      entityType: lastEvent.page.entityType,
      entityId: lastEvent.page.entityId,
      entityName: lastEvent.page.entityName,
      url: lastEvent.page.url,
      fields: lastEvent.page.fields,
    });
  }, [lastEvent]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          {t("navigation.crm.workbench")}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-neutral-100">{t(titleKey)}</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">{t(descriptionKey)}</p>
      </header>

      <section className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-4">
        <h2 className="text-sm font-medium text-neutral-300">
          {t("navigation.crm.contextFromCrm")}
        </h2>
        {lastEvent ? (
          <pre className="mt-3 max-h-64 overflow-auto rounded bg-neutral-950 p-3 font-mono text-xs text-neutral-300">
            {contextPreview}
          </pre>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">{t("navigation.crm.noContextYet")}</p>
        )}
      </section>
    </div>
  );
}
