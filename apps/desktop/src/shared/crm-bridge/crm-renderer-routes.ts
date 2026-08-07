/** Desktop Renderer paths for CRM bridge `open-renderer-route`. */
export const CRM_RENDERER_ROUTES = {
  customerAi: "/crm/customer-ai",
  quoteAssistant: "/crm/quote-assistant",
  orderRisk: "/crm/order-risk",
} as const;

export type CrmRendererRoutePath =
  (typeof CRM_RENDERER_ROUTES)[keyof typeof CRM_RENDERER_ROUTES];

export type CrmRendererRouteId = "customer-ai" | "quote-assistant" | "order-risk";

export interface CrmRendererRouteDefinition {
  id: CrmRendererRouteId;
  path: CrmRendererRoutePath;
  titleKey: string;
}

export const CRM_RENDERER_ROUTE_DEFINITIONS: CrmRendererRouteDefinition[] = [
  {
    id: "customer-ai",
    path: CRM_RENDERER_ROUTES.customerAi,
    titleKey: "navigation.crm.customerAi",
  },
  {
    id: "quote-assistant",
    path: CRM_RENDERER_ROUTES.quoteAssistant,
    titleKey: "navigation.crm.quoteAssistant",
  },
  {
    id: "order-risk",
    path: CRM_RENDERER_ROUTES.orderRisk,
    titleKey: "navigation.crm.orderRisk",
  },
];

const pathToDefinition = new Map(
  CRM_RENDERER_ROUTE_DEFINITIONS.map((def) => [def.path, def]),
);

/** Normalize config route (with or without leading slash). */
export function resolveCrmRendererRoute(
  route: string | undefined,
): CrmRendererRouteDefinition | null {
  if (!route?.trim()) return null;
  const normalized = route.startsWith("/") ? route : `/${route}`;
  return pathToDefinition.get(normalized as CrmRendererRoutePath) ?? null;
}

export function isCrmRendererRoutePath(path: string): path is CrmRendererRoutePath {
  return resolveCrmRendererRoute(path) !== null;
}
