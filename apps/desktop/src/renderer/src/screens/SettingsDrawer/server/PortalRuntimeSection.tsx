import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AiOsPortalInfo,
  RuntimeServiceRecord,
} from "../../../../../shared/aios/aios-contract";

export function PortalRuntimeSection(): React.JSX.Element {
  const { t } = useTranslation("portal");
  const [services, setServices] = useState<RuntimeServiceRecord[]>([]);
  const [portalInfo, setPortalInfo] = useState<AiOsPortalInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.aiosRuntime) return;
    try {
      const [snapshot, info] = await Promise.all([
        window.aiosRuntime.getRuntimeSnapshot(),
        window.aiosRuntime.getPortalInfo(),
      ]);
      setServices(snapshot.services);
      setPortalInfo(info);
      setActionError(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!window.aiosRuntime) return;
    const unsub = window.aiosRuntime.onAiOsRuntimeChanged(() => {
      void refresh();
    });
    return unsub;
  }, [refresh]);

  async function runAction(
    action: "start" | "stop" | "restart" | "doctor",
  ): Promise<void> {
    if (!window.aiosRuntime) return;
    setBusy(true);
    setActionError(null);
    try {
      if (action === "start") {
        await window.aiosRuntime.startAiOs();
      } else if (action === "stop") {
        await window.aiosRuntime.stopAiOs();
      } else if (action === "restart") {
        await window.aiosRuntime.restartAiOs();
      } else {
        const report = await window.aiosRuntime.runDoctor();
        const failed = report.checks.filter((c) => c.status === "error");
        if (failed.length > 0) {
          setActionError(failed.map((c) => `${c.name}: ${c.message}`).join("\n"));
        }
      }
      await refresh();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!window.aiosRuntime) {
    return (
      <section className="settings-section">
        <div className="settings-section-title">{t("portalRuntimeTitle")}</div>
        <p className="settings-field-hint">{t("portalRuntimeApiMissing")}</p>
      </section>
    );
  }

  const backend = services.find((s) => s.service_id === "aios-backend");
  const frontend = services.find((s) => s.service_id === "aios-frontend");

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("portalRuntimeTitle")}</div>
      <p className="settings-field-hint">{t("portalRuntimeHint")}</p>

      <dl className="settings-hermes-info" style={{ marginTop: 12 }}>
        <div className="settings-hermes-row">
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">{t("portalInstallStatusLabel")}</span>
            <span className="settings-hermes-value">
              {portalInfo?.installed ? t("portalInstalled") : t("portalNotInstalled")}
            </span>
          </div>
          {portalInfo?.portalRoot ? (
            <div className="settings-hermes-detail">
              <span className="settings-hermes-label">{t("portalRootLabel")}</span>
              <span className="settings-hermes-value settings-hermes-value-mono">
                {portalInfo.portalRoot}
              </span>
            </div>
          ) : null}
        </div>
        <div className="settings-hermes-row">
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Portal Backend</span>
            <span className="settings-hermes-value">{backend?.status ?? "—"}</span>
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Portal Frontend</span>
            <span className="settings-hermes-value">{frontend?.status ?? "—"}</span>
          </div>
        </div>
      </dl>

      {!portalInfo?.installed ? (
        <p className="settings-field-hint" style={{ marginTop: 8 }}>
          {t("portalNotInstalledHint")}
        </p>
      ) : null}

      {backend?.last_error ? (
        <p className="settings-field-hint" style={{ color: "var(--color-danger, #f87171)" }}>
          {backend.last_error}
        </p>
      ) : null}
      {frontend?.last_error ? (
        <p className="settings-field-hint" style={{ color: "var(--color-danger, #f87171)" }}>
          {frontend.last_error}
        </p>
      ) : null}
      {actionError ? (
        <pre className="settings-log-preview" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
          {actionError}
        </pre>
      ) : null}

      <div className="settings-hermes-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !portalInfo?.installed}
          onClick={() => void runAction("start")}
        >
          {busy ? t("startingPortal") : t("startPortal")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void runAction("stop")}
        >
          {t("stopPortal")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void runAction("restart")}
        >
          {t("restartPortal")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void runAction("doctor")}
        >
          {t("portalDoctor")}
        </button>
      </div>
    </section>
  );
}
