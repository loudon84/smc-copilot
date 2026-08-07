import { useCallback, useMemo, useState } from "react";
import { Copy, RefreshCw, Send } from "lucide-react";
import type {
  CrmBridgeResult,
  CrmBridgeStoredEvent,
  CrmDesktopCommand,
  ProductPayload,
} from "../../../../shared/crm-bridge";
import { useCrmBridgeEvents } from "./hooks/use-crm-bridge-events";

export interface CrmEventPanelProps {
  className?: string;
  onRefreshSnapshot?: () => void;
}

function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const DEFAULT_JSON_PAYLOAD = JSON.stringify(
  {
    riskLevel: "medium",
    summary: "AI analysis summary",
    nextAction: "Follow up call",
  },
  null,
  2,
);

const DEMO_TEST_PRODUCT: ProductPayload = {
  sku: "PHONE-ELECTRON-001",
  brand: "Electron Mobile",
  model: "Bridge X1",
  productName: "Electron Bridge X1 512GB",
  ram: "12GB",
  storage: "512GB",
  retailPrice: 5999,
  suppliers: [
    {
      supplierId: "SUP-0001",
      supplierName: "华芯供应链",
      supplyPrice: 4200,
      stockQty: 300,
      moq: 10,
      leadTimeDays: 7,
      status: "available",
      remark: "Electron 写入测试",
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractProductPayload(event: CrmBridgeStoredEvent | null): ProductPayload | null {
  if (!event?.payload || !isRecord(event.payload)) return null;
  const product = event.payload.product;
  if (!isRecord(product)) return null;
  if (typeof product.sku !== "string") return null;
  return product as unknown as ProductPayload;
}

function formatReceivedAt(event: CrmBridgeStoredEvent): string {
  if (event.createdAt) return event.createdAt;
  return event.trigger.timestamp;
}

export function CrmEventPanel({
  className,
  onRefreshSnapshot,
}: CrmEventPanelProps): React.JSX.Element {
  const { lastEvent, error, refresh } = useCrmBridgeEvents();
  const [sending, setSending] = useState(false);
  const [actionKey, setActionKey] = useState("lead.openAiForm");
  const [selector, setSelector] = useState('[data-ai-action="lead.openAiForm"]');
  const [jsonSchema, setJsonSchema] = useState("lead.ai_analysis");
  const [jsonPayload, setJsonPayload] = useState(DEFAULT_JSON_PAYLOAD);
  const [targetUrl, setTargetUrl] = useState("https://crm.company.com/leads/1001");
  const [manualHandoffId, setManualHandoffId] = useState("");
  const [commandResult, setCommandResult] = useState<CrmBridgeResult | null>(null);

  const ctxText = useMemo(() => {
    if (!lastEvent) return "";
    return jsonStringifySafe(lastEvent);
  }, [lastEvent]);

  const productContext = useMemo(() => {
    if (!lastEvent || lastEvent.type !== "crm.product.context.submit") return null;
    return extractProductPayload(lastEvent);
  }, [lastEvent]);

  const openFormPayload = useMemo(
    () =>
      jsonStringifySafe({
        tool: "crm.open_form_with_json",
        url: targetUrl,
        actionKey,
        schema: jsonSchema,
        entityType: lastEvent?.page.entityType,
        entityId: lastEvent?.page.entityId,
        data: (() => {
          try {
            return JSON.parse(jsonPayload) as Record<string, unknown>;
          } catch {
            return {};
          }
        })(),
      }),
    [actionKey, jsonPayload, jsonSchema, lastEvent, targetUrl],
  );

  const runCommand = useCallback(
    async (command: CrmDesktopCommand) => {
      setSending(true);
      try {
        const result = await window.aiosBrowser.sendCrmCommand(command);
        setCommandResult(result);
        if (command.type === "desktop.crm.pushJson") {
          const handoffId = command.payload?.handoffId;
          if (typeof handoffId === "string") {
            setManualHandoffId(handoffId);
          }
        }
      } finally {
        setSending(false);
      }
    },
    [],
  );

  const copyContext = useCallback(async () => {
    if (!ctxText) return;
    await navigator.clipboard.writeText(ctxText);
  }, [ctxText]);

  const sendToastCommand = useCallback(async () => {
    if (!lastEvent) return;
    await runCommand({
      commandId: `cmd_${Date.now()}`,
      type: "desktop.crm.showToast",
      payload: { message: `Desktop received ${lastEvent.type}` },
      createdAt: new Date().toISOString(),
    });
  }, [lastEvent, runCommand]);

  const sendClickCommand = useCallback(async () => {
    await runCommand({
      commandId: `cmd_click_${Date.now()}`,
      type: "desktop.crm.clickButton",
      target: {
        actionKey,
        selector,
        entityId: lastEvent?.page.entityId,
      },
      payload: {},
      expectAck: true,
      timeoutMs: 8000,
      createdAt: new Date().toISOString(),
    });
  }, [actionKey, lastEvent, runCommand, selector]);

  const sendPushJsonCommand = useCallback(async () => {
    const handoffId = `manual_${Date.now()}`;
    await runCommand({
      commandId: `cmd_json_${Date.now()}`,
      type: "desktop.crm.pushJson",
      payload: {
        handoffId,
        schema: jsonSchema,
        entityType: lastEvent?.page.entityType,
        entityId: lastEvent?.page.entityId,
        data: JSON.parse(jsonPayload) as Record<string, unknown>,
      },
      expectAck: true,
      timeoutMs: 8000,
      createdAt: new Date().toISOString(),
    });
  }, [jsonPayload, jsonSchema, lastEvent, runCommand]);

  const sendRunActionCommand = useCallback(async () => {
    await runCommand({
      commandId: `cmd_action_${Date.now()}`,
      type: "desktop.crm.runAction",
      target: {
        actionKey,
        entityId: lastEvent?.page.entityId,
      },
      payload: {
        handoffId: manualHandoffId || undefined,
      },
      expectAck: true,
      timeoutMs: 12000,
      createdAt: new Date().toISOString(),
    });
  }, [actionKey, lastEvent, manualHandoffId, runCommand]);

  const buildProductCommand = useCallback(
    (type: "desktop.crm.product.fillForm" | "desktop.crm.product.create"): CrmDesktopCommand => ({
      commandId: `cmd_${Date.now()}`,
      type,
      payload: { product: DEMO_TEST_PRODUCT },
      createdAt: new Date().toISOString(),
      expectAck: type === "desktop.crm.product.create",
      timeoutMs: type === "desktop.crm.product.create" ? 12000 : undefined,
    }),
    [],
  );

  const sendFillProductForm = useCallback(async () => {
    await runCommand(buildProductCommand("desktop.crm.product.fillForm"));
  }, [buildProductCommand, runCommand]);

  const sendCreateProduct = useCallback(async () => {
    await runCommand(buildProductCommand("desktop.crm.product.create"));
  }, [buildProductCommand, runCommand]);

  return (
    <div className={`flex flex-col h-full ${className ?? ""}`}>
      <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-300">CRM Context</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={copyContext}
            disabled={!ctxText}
            className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
            title="Copy context"
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            onClick={() => void sendToastCommand()}
            disabled={!lastEvent || sending}
            className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 disabled:opacity-50"
            title="Send command"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {error ? <p className="text-xs text-red-400">{error}</p> : null}

        <div className="space-y-2 text-xs border border-emerald-900/50 rounded p-2 bg-emerald-950/20">
          <p className="text-emerald-400/90 font-medium">CRM-Lite 商品 Bridge（V5.7.10）</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => void sendFillProductForm()}
              className="px-2 py-1 rounded bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-100 disabled:opacity-50"
            >
              填充表单到 CRM
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => void sendCreateProduct()}
              className="px-2 py-1 rounded bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-100 disabled:opacity-50"
            >
              写入商品到 CRM
            </button>
          </div>
          <p className="text-neutral-500 text-[11px]">
            请在 WebOperator 打开 http://localhost:3000/product-form.html 后点击测试按钮。
          </p>
        </div>

        {productContext ? (
          <div className="space-y-2 text-xs border border-sky-900/50 rounded p-2 bg-sky-950/20">
            <p className="text-sky-300 font-medium">商品上下文</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-neutral-300">
              <dt className="text-neutral-500">requestId</dt>
              <dd className="break-all font-mono text-[11px]">{lastEvent?.requestId}</dd>
              <dt className="text-neutral-500">event type</dt>
              <dd>{lastEvent?.type}</dd>
              <dt className="text-neutral-500">商品 ID</dt>
              <dd>{productContext.id ?? "—"}</dd>
              <dt className="text-neutral-500">商品名称</dt>
              <dd>{productContext.productName}</dd>
              <dt className="text-neutral-500">SKU</dt>
              <dd>{productContext.sku}</dd>
              <dt className="text-neutral-500">品牌</dt>
              <dd>{productContext.brand}</dd>
              <dt className="text-neutral-500">供应商数量</dt>
              <dd>{productContext.suppliers?.length ?? 0}</dd>
              <dt className="text-neutral-500">接收时间</dt>
              <dd>{lastEvent ? formatReceivedAt(lastEvent) : "—"}</dd>
            </dl>
            <div>
              <p className="text-neutral-500 mb-1">payload 预览</p>
              <pre className="text-[11px] whitespace-pre-wrap break-words text-neutral-300 bg-neutral-900/40 border border-neutral-800 rounded p-2 max-h-40 overflow-y-auto">
                {jsonStringifySafe(lastEvent?.payload)}
              </pre>
            </div>
          </div>
        ) : null}

        <div className="space-y-2 text-xs border border-neutral-800 rounded p-2">
          <p className="text-neutral-400 font-medium">CRM 调试</p>
          <label className="block space-y-1">
            <span className="text-neutral-500">actionKey</span>
            <input
              value={actionKey}
              onChange={(e) => setActionKey(e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-neutral-200"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-neutral-500">selector</span>
            <input
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-neutral-200"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-neutral-500">jsonSchema</span>
            <input
              value={jsonSchema}
              onChange={(e) => setJsonSchema(e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-neutral-200"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-neutral-500">targetUrl</span>
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-neutral-200"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-neutral-500">jsonPayload</span>
            <textarea
              value={jsonPayload}
              onChange={(e) => setJsonPayload(e.target.value)}
              rows={4}
              className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-neutral-200 font-mono text-[11px]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => void sendClickCommand()}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            >
              测试点击按钮
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => void sendPushJsonCommand()}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            >
              测试推送 JSON
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => void sendRunActionCommand()}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            >
              测试运行动作
            </button>
          </div>
          <div>
            <p className="text-neutral-500 mb-1">测试跳转并打开 Form（复制给 Hermes）</p>
            <pre className="text-[11px] whitespace-pre-wrap break-words text-neutral-300 bg-neutral-900/40 border border-neutral-800 rounded p-2">
              {openFormPayload}
            </pre>
          </div>
          {commandResult ? (
            <div>
              <p className="text-neutral-500 mb-1">Command result</p>
              <pre className="text-[11px] whitespace-pre-wrap break-words text-neutral-300 bg-neutral-900/40 border border-neutral-800 rounded p-2">
                {jsonStringifySafe(commandResult)}
              </pre>
            </div>
          ) : null}
        </div>

        {lastEvent ? (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <span className="px-1.5 py-0.5 rounded bg-sky-900/40 text-sky-300">
                {lastEvent.type}
              </span>
              {lastEvent.origin ? (
                <span className="text-neutral-500 break-all">{lastEvent.origin}</span>
              ) : null}
            </div>

            <div>
              <p className="text-neutral-500 mb-0.5">Entity</p>
              <p className="text-sm text-neutral-200">
                {lastEvent.page.entityType ?? "—"} / {lastEvent.page.entityId ?? "—"}
              </p>
              {lastEvent.page.entityName ? (
                <p className="text-xs text-neutral-400">{lastEvent.page.entityName}</p>
              ) : null}
            </div>

            <div>
              <p className="text-neutral-500 mb-0.5">URL</p>
              <p className="text-xs text-neutral-300 break-all">{lastEvent.page.url}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefreshSnapshot}
                className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs"
              >
                Refresh snapshot
              </button>
            </div>

            <div>
              <p className="text-neutral-500 mb-1">Raw</p>
              <pre className="text-[11px] leading-snug whitespace-pre-wrap break-words text-neutral-300 bg-neutral-900/40 border border-neutral-800 rounded p-2">
                {ctxText}
              </pre>
            </div>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">No CRM event received</p>
        )}
      </div>
    </div>
  );
}
