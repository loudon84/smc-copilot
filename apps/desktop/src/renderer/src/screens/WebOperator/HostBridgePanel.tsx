import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, RefreshCw, Send, Trash2 } from "lucide-react";
import type { HostBridgeStoredEvent } from "../../../../shared/crm-bridge";
import {
  buildPageContextFromHostBridgeEvent,
  resolveHostBridgePageUrl,
} from "./context/build-page-context";
import { useWebOperatorPageContext } from "./context";
import { useHostBridgeCommand } from "./host-bridge/HostBridgeCommandContext";
import { useHostBridgeEvents } from "./hooks/use-host-bridge-events";

export interface HostBridgePanelProps {
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

const DEFAULT_CALLBACK_URL = "http://localhost:3000/product-form.html?action=create";

const DEMO_FILL_FIELDS: Record<string, unknown> = {
  sku: "PHONE-ELECTRON-001",
  brand: "Electron Mobile",
  model: "Bridge X1",
  productName: "Electron Bridge X1 512GB",
  ram: "12GB",
  storage: "512GB",
  retailPrice: 5999,
};

export function HostBridgePanel({
  className,
  onRefreshSnapshot,
}: HostBridgePanelProps): React.JSX.Element {
  const { lastHandoff, configPath, error, refresh } = useHostBridgeEvents();
  const { lastEvent, runCommand, sending, lastCommandResult: commandResult } = useHostBridgeCommand();
  const { currentTask, requestHermesAnalysis } = useWebOperatorPageContext();
  const [callbackUrlDraft, setCallbackUrlDraft] = useState(DEFAULT_CALLBACK_URL);

  const ctxText = useMemo(() => {
    if (!lastEvent) return "";
    return jsonStringifySafe(lastEvent);
  }, [lastEvent]);

  const copyContext = useCallback(async () => {
    if (!ctxText) return;
    await navigator.clipboard.writeText(ctxText);
  }, [ctxText]);

  const reloadConfig = useCallback(async () => {
    await window.aiosBrowser.reloadHostBridgeConfig();
    await refresh();
  }, [refresh]);

  const openConfig = useCallback(async () => {
    await window.aiosBrowser.openHostBridgeConfigFile();
  }, []);

  const sendTestFill = useCallback(async () => {
    await runCommand({
      commandId: `cmd_test_${Date.now()}`,
      type: "desktop.host.form.fill",
      formType: lastEvent?.formType ?? "product",
      action: "create",
      payload: {
        fields: DEMO_FILL_FIELDS,
        subTables: {
          suppliers: [
            {
              supplierId: "SUP-0001",
              supplierName: "华芯供应链",
              supplyPrice: 4200,
              stockQty: 300,
              moq: 10,
              leadTimeDays: 7,
              status: "available",
            },
          ],
        },
      },
      createdAt: new Date().toISOString(),
      expectAck: true,
      timeoutMs: 12000,
    });
  }, [lastEvent, runCommand]);

  const openCallbackTab = useCallback(async () => {
    const url = (lastEvent?.callbackUrl ?? callbackUrlDraft).trim();
    if (!url) return;
    await window.aiosBrowser.createWebOperatorTab({
      url,
      kind: "host-callback",
      activate: true,
    });
  }, [lastEvent, callbackUrlDraft]);

  const openCallbackTabDemo = useCallback(async () => {
    const jsonData = {
      tempType: [
        {
          custname: "天地伟业技术有限公司",
          orderno: "POJS2502270017",
          supname: "深圳市芯云科技有限公司",
          deliverydate: "2025-03-10",
          partno: "1B.3004",
          partdesc: "芯片-视频 编解码 [SSC377]- QFN88-sigmastar -9mm*9mm",
          quantity: "3",
          price: "2080",
          amount: "6240.00",
        },
        {
          custname: "天地伟业技术有限公司",
          orderno: "POJS2502270017",
          supname: "深圳市芯云科技有限公司",
          deliverydate: "2025-03-10",
          partno: "1B.3004",
          partdesc: "芯片-视频 编解码 [SSC338G]- BGA307-sigmastar",
          quantity: "2",
          price: "220",
          amount: "440.00",
        },
      ],
    };

    const encoded = encodeURIComponent(JSON.stringify(jsonData));
    const url = lastEvent?.origin + "/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType=" +
      encoded;
    
    await window.aiosBrowser.createWebOperatorTab({
      url,
      kind: "host-callback",
      activate: true,
    });
  }, [lastEvent, callbackUrlDraft]);

  const clearHandoff = useCallback(async () => {
    await window.aiosBrowser.clearHostHandoff();
    await refresh();
  }, [refresh]);

  const triggerHermesAnalysis = useCallback(
    (event: HostBridgeStoredEvent, options?: { force?: boolean }) => {
      const pageUrl = resolveHostBridgePageUrl(event);
      if (!pageUrl || !event.requestId?.trim()) return;
      if (
        !options?.force &&
        currentTask?.source === "web-host-bridge" &&
        currentTask?.requestId === event.requestId
      ) {
        return;
      }
      const pageContext = buildPageContextFromHostBridgeEvent(event);
      requestHermesAnalysis({
        source: "web-host-bridge",
        requestId: event.requestId,
        pageUrl,
        pageContext,
        requiredSkillName: event.skillName,
        formType: event.formType,
        action: event.action,
        callbackUrl: event.callbackUrl,
        preferStartDialog: true,
        hostBridgeRequestId: event.requestId,
        force: options?.force ?? false,
      });
    },
    [currentTask?.source, currentTask?.requestId, requestHermesAnalysis],
  );

  const runAnalyze = useCallback(() => {
    if (!lastEvent) return;
    const pageUrl = resolveHostBridgePageUrl(lastEvent);
    if (!pageUrl) return;
    requestHermesAnalysis({
      source: "web-host-bridge",
      requestId: lastEvent.requestId,
      pageUrl,
      pageContext: buildPageContextFromHostBridgeEvent(lastEvent),
      requiredSkillName: lastEvent.skillName,
      formType: lastEvent.formType,
      action: lastEvent.action,
      callbackUrl: lastEvent.callbackUrl,
      preferStartDialog: true,
      hostBridgeRequestId: lastEvent.requestId,
      force: true,
    });
  }, [lastEvent, requestHermesAnalysis]);

  const lastAutoAnalyzeRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastEvent?.requestId) return;
    if (lastAutoAnalyzeRequestIdRef.current === lastEvent.requestId) return;
    lastAutoAnalyzeRequestIdRef.current = lastEvent.requestId;
    triggerHermesAnalysis(lastEvent, { force: false });
  }, [lastEvent, triggerHermesAnalysis]);

  return (
    <div className={`flex flex-col h-full ${className ?? ""}`}>
      <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-300">Host Context</h3>
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
            title="Copy event JSON"
          >
            <Copy size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-xs">
        {error ? <p className="text-red-400">{error}</p> : null}

        <div className="text-neutral-500 break-all">
          <span className="text-neutral-400">Config: </span>
          {configPath || "—"}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sending}
            onClick={() => void reloadConfig()}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
          >
            Reload config
          </button>
          <button
            type="button"
            onClick={() => void openConfig()}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 inline-flex items-center gap-1"
          >
            <ExternalLink size={12} />
            Open config
          </button>
          {!lastEvent?.callbackUrl ? (
            <input
              type="url"
              value={callbackUrlDraft}
              onChange={(e) => setCallbackUrlDraft(e.target.value)}
              placeholder="callbackUrl"
              className="min-w-[12rem] flex-1 px-2 py-1 rounded bg-neutral-900 border border-neutral-700 text-neutral-200"
              aria-label="Callback URL"
            />
          ) : null}
          <button
            type="button"
            disabled={sending || !(lastEvent?.callbackUrl ?? callbackUrlDraft).trim()}
            onClick={() => void openCallbackTab()}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
          >
            Open callback tab
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void openCallbackTabDemo()}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
          >
            Open callback demo
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendTestFill()}
            className="px-2 py-1 rounded bg-sky-900/50 hover:bg-sky-800/60 text-sky-100 inline-flex items-center gap-1"
          >
            <Send size={12} />
            Test fillForm
          </button>
          <button
            type="button"
            onClick={() => void clearHandoff()}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 inline-flex items-center gap-1"
          >
            <Trash2 size={12} />
            Clear handoff
          </button>
          {onRefreshSnapshot ? (
            <button
              type="button"
              onClick={onRefreshSnapshot}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
            >
              Refresh snapshot
            </button>
          ) : null}
          {ctxText ? (
            <button
              type="button"
              onClick={runAnalyze}
              className="px-2 py-1 rounded bg-blue-800 hover:bg-blue-700 text-neutral-100"
            >
              AI 分析
            </button>
            ): null}
        </div>
          
        {lastEvent ? (
          <pre
            className="m-0 max-h-[200px] overflow-auto rounded border border-neutral-800 bg-neutral-900/40 p-2 font-mono text-[11px] leading-relaxed text-neutral-300 whitespace-pre"
            style={{maxHeight: "200px", overflowY: "auto", margin: "8px", border: "1px solid lightgray"}}
            aria-label="Last HostBridge event JSON"
          >
            {ctxText}
          </pre>
        ) : (
          <p className="text-neutral-500">No HostBridge event received</p>
        )}

        {lastHandoff ? (
          <div className="border border-sky-900/40 rounded p-2 bg-sky-950/20">
            <p className="text-sky-300 font-medium mb-1">Latest handoff</p>
            <p>
              {lastHandoff.handoffId} — <span className="text-sky-200">{lastHandoff.status}</span>
            </p>
            {lastHandoff.lastError ? (
              <p className="text-red-400 mt-1">{lastHandoff.lastError}</p>
            ) : null}
          </div>
        ) : null}

        {commandResult ? (
          <pre className="m-0 max-h-[200px] overflow-auto rounded border border-neutral-800 bg-neutral-900/40 p-2 font-mono text-[11px] leading-relaxed text-neutral-300 whitespace-pre">
            {jsonStringifySafe(commandResult)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
