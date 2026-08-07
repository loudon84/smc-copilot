export type CrmDesktopEventType =
  | "crm.context.submit"
  | "crm.customer.open-ai-panel"
  | "crm.quote.create-assist"
  | "crm.order.risk-check"
  | "crm.page.snapshot-request";

export interface CrmDesktopPageContext {
  app: "crm";
  entityType?: string;
  entityId?: string;
  entityName?: string;
  url?: string;
  title?: string;
  selectedIds?: string[];
  fields?: Record<string, string | number | boolean | null>;
  safeText?: string;
}

export interface CrmDesktopEmitOptions {
  requestId?: string;
  triggerElementId?: string;
  triggerLabel?: string;
}

export interface CrmDesktopCommand {
  commandId: string;
  type: string;
  target?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  createdAt: string;
}

