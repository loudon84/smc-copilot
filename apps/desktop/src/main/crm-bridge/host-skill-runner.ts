import type {
  HostBridgeSubmitEvent,
  HostSkillRunResult,
} from "../../shared/crm-bridge/host-bridge-contract";
import { resolveHostBridgeRoute } from "./host-bridge-config";

const MOCK_PRODUCT_CREATE_FIELDS: Record<string, unknown> = {
  sku: "PHONE-ELECTRON-001",
  brand: "Electron Mobile",
  model: "Bridge X1",
  productName: "Electron Bridge X1 512GB",
  ram: "12GB",
  storage: "512GB",
  retailPrice: 5999,
  status: "draft",
  description: "AI generated draft from HostBridge mock runner",
};

const MOCK_SUPPLIERS = [
  {
    supplierId: "SUP-0001",
    supplierName: "华芯供应链",
    supplyPrice: 4200,
    stockQty: 300,
    moq: 10,
    leadTimeDays: 7,
    status: "available",
    remark: "HostBridge mock fill",
  },
];

export async function runHostSkill(event: HostBridgeSubmitEvent): Promise<HostSkillRunResult> {
  const route = resolveHostBridgeRoute(
    event.formType,
    event.action,
    event.skillName,
  );
  const skillName = event.skillName ?? route?.skillName ?? `host-${event.formType}-${event.action}`;

  if (event.action === "analytic" || event.action === "view") {
    const product = event.pageContext.data?.product;
    return {
      ok: true,
      requestId: event.requestId,
      skillName,
      message: `Mock analysis for ${event.formType}`,
      analysisResult: {
        summary: `Analyzed ${event.pageContext.entityName ?? event.formType}`,
        product,
      },
    };
  }

  if (event.action === "create" || event.action === "edit") {
    const sourceProduct =
      event.pageContext.data && typeof event.pageContext.data === "object"
        ? (event.pageContext.data as Record<string, unknown>).product
        : undefined;

    const fields =
      sourceProduct && typeof sourceProduct === "object"
        ? { ...MOCK_PRODUCT_CREATE_FIELDS, ...(sourceProduct as Record<string, unknown>) }
        : { ...MOCK_PRODUCT_CREATE_FIELDS };

    if (event.action === "edit" && event.pageContext.entityId) {
      fields.id = event.pageContext.entityId;
    }

    return {
      ok: true,
      requestId: event.requestId,
      skillName,
      message: `Mock fillFormPayload for ${event.action}`,
      fillFormPayload: {
        fields,
        subTables: { suppliers: MOCK_SUPPLIERS },
        meta: { source: "host-skill-runner-mock", action: event.action },
      },
    };
  }

  return {
    ok: false,
    requestId: event.requestId,
    errorCode: "ROUTE_NOT_FOUND",
    message: `Unsupported action: ${event.action}`,
  };
}
