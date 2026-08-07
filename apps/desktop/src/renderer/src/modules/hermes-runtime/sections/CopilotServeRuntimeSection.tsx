import { useCallback, useEffect, useState } from "react";
import type {
  CopilotServeDeployResult,
  CopilotServePreflightResult,
  CopilotServeProcessStatus,
  CopilotServeStatus,
} from "../../../../../shared/copilot-serve/copilot-serve-contract";

const STATUS_LABELS: Record<CopilotServeProcessStatus, string> = {
  missing: "未安装",
  stopped: "已停止",
  starting: "启动中",
  running: "运行中",
  degraded: "降级",
  error: "错误",
};

export function CopilotServeRuntimeSection(): React.JSX.Element {
  const [status, setStatus] = useState<CopilotServeStatus | null>(null);
  const [preflight, setPreflight] = useState<CopilotServePreflightResult | null>(null);
  const [logs, setLogs] = useState("");
  const [deployLog, setDeployLog] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!window.copilotServe) return;
    const [s, p] = await Promise.all([
      window.copilotServe.getStatus(),
      window.copilotServe.precheck(),
    ]);
    setStatus(s);
    setPreflight(p);
  }, []);

  useEffect(() => {
    void refresh();
    if (!window.copilotServe) return;
    const unsubStatus = window.copilotServe.onStatusChanged(() => {
      void refresh();
    });
    const unsubDeploy = window.copilotServe.onDeployProgress((event) => {
      setDeployLog((prev) => (prev ? `${prev}\n${event.line}` : event.line));
    });
    return () => {
      unsubStatus();
      unsubDeploy();
    };
  }, [refresh]);

  async function handleDeploy(force = false): Promise<void> {
    if (!window.copilotServe) return;
    setBusy(true);
    setDeployLog("");
    try {
      const result: CopilotServeDeployResult = await window.copilotServe.deploy({
        force,
        restartDesktop: false,
      });
      setDeployLog(result.log || result.error || "");
      await refresh();
      if (result.success) {
        await window.copilotServe.start();
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(
    action: "start" | "stop" | "restart" | "logs" | "openDir",
  ): Promise<void> {
    if (!window.copilotServe) return;
    setBusy(true);
    try {
      if (action === "start") await window.copilotServe.start();
      if (action === "stop") await window.copilotServe.stop();
      if (action === "restart") await window.copilotServe.restart();
      if (action === "logs") {
        const text = await window.copilotServe.getLogs({ tailLines: 80 });
        setLogs(text);
      }
      if (action === "openDir") await window.copilotServe.openRuntimeDir();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!window.copilotServe) {
    return (
      <div className="settings-section">
        <div className="settings-section-title">Copilot Serve</div>
        <p className="settings-field-hint">copilotServe API 不可用（preload 未加载）</p>
      </div>
    );
  }

  const displayStatus = status?.status ?? "missing";

  return (
    <div className="settings-section">
      <div className="settings-section-title">Copilot Serve Runtime</div>
      <div className="settings-hermes-info">
        <div className="settings-hermes-row">
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">状态</span>
            <span className="settings-hermes-value">
              {STATUS_LABELS[displayStatus] ?? displayStatus}
            </span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">端口</span>
            <span className="settings-hermes-value">{status?.port ?? 8765}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">PID</span>
            <span className="settings-hermes-value">{status?.pid ?? "—"}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Base URL</span>
            <span className="settings-hermes-value settings-hermes-path">
              {status?.baseUrl ?? "—"}
            </span>
          </div>
        </div>
        {status?.lastError && (
          <div className="settings-hermes-result error">{status.lastError}</div>
        )}
        {status?.logPath && (
          <div className="settings-field-hint">日志: {status.logPath}</div>
        )}

        <div className="settings-hermes-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void handleDeploy(false)}
          >
            {busy ? "处理中…" : "安装 copilot-serve"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void handleDeploy(true)}
          >
            强制重装
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || displayStatus === "missing"}
            onClick={() => void handleAction("start")}
          >
            启动
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void handleAction("stop")}
          >
            停止
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void handleAction("restart")}
          >
            重启
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void handleAction("logs")}
          >
            查看日志
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void handleAction("openDir")}
          >
            打开 runtime 目录
          </button>
        </div>

        {preflight && (
          <div style={{ marginTop: 12 }}>
            <div className="settings-field-hint" style={{ marginBottom: 6 }}>
              验证项（{preflight.ready ? "就绪" : preflight.installed ? "已安装未就绪" : "未安装"}）
            </div>
            <ul className="settings-field-hint" style={{ listStyle: "none", padding: 0 }}>
              {preflight.checks.map((c) => (
                <li key={c.id} style={{ marginBottom: 4 }}>
                  <span
                    style={{
                      color:
                        c.status === "pass"
                          ? "#34d399"
                          : c.status === "fail"
                            ? "#f87171"
                            : "#fbbf24",
                    }}
                  >
                    {c.status}
                  </span>{" "}
                  {c.label}
                  {c.detail ? ` — ${c.detail}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {deployLog && <pre className="settings-hermes-doctor">{deployLog}</pre>}
        {logs && <pre className="settings-hermes-doctor">{logs}</pre>}
      </div>
    </div>
  );
}
