import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../../components/useI18n";
import { getCachedVersion } from "../settings-shared";

export interface HermesAgentSectionProps {
  profile?: string;
}

export function HermesAgentSection({ profile }: HermesAgentSectionProps): React.JSX.Element {
  const { t } = useI18n();
  const [hermesHome, setHermesHome] = useState("");
  const [hermesVersion, setHermesVersion] = useState<string | null>(getCachedVersion);
  const [appVersion, setAppVersion] = useState("");
  const [doctorOutput, setDoctorOutput] = useState<string | null>(null);
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  const [updateResultType, setUpdateResultType] = useState<"success" | "error" | null>(null);
  const [dumpOutput, setDumpOutput] = useState<string | null>(null);
  const [dumpRunning, setDumpRunning] = useState(false);
  const [serveControlPlane, setServeControlPlane] = useState(false);
  const [diagnosticsEnv, setDiagnosticsEnv] = useState<string | null>(null);

  const loadConfig = useCallback(async (): Promise<void> => {
    const [home, aVersion] = await Promise.all([
      window.hermesAPI.getHermesHome(profile),
      window.hermesAPI.getAppVersion(),
    ]);
    setHermesHome(home);
    setAppVersion(aVersion);

    window.hermesAPI.getHermesVersion().then((v) => {
      setHermesVersion(v);
      if (v) {
        try {
          localStorage.setItem("hermes-version-cache", v);
        } catch {
          /* ignore */
        }
      }
    });

    if (window.copilotRuntime) {
      try {
        setServeControlPlane(await window.copilotRuntime.isServeControlPlane());
      } catch {
        setServeControlPlane(false);
      }
    }
  }, [profile]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleDoctor(): Promise<void> {
    setDoctorRunning(true);
    setDoctorOutput(null);
    if (serveControlPlane && window.copilotRuntime) {
      try {
        const [summary, env, logs] = await Promise.all([
          window.copilotRuntime.getDiagnosticsSummary(),
          window.copilotRuntime.getDiagnosticsEnvironment(),
          window.copilotRuntime.getDiagnosticsLogs({ tail: 40 }),
        ]);
        const lines = [
          "Serve Diagnostics (CLI doctor disabled under Serve control plane)",
          `runtime=${summary?.runtimeVersion ?? "—"} api=${summary?.runtimeApiVersion ?? "—"}`,
          `hermes=${summary?.hermesVersion ?? "—"} storeHealthy=${String(summary?.storeHealthy)}`,
          `platform=${env?.platform ?? "—"} hermesInstalled=${String(env?.hermesInstalled)}`,
          "",
          ...(logs?.lines ?? []),
        ];
        setDoctorOutput(lines.join("\n"));
        setDiagnosticsEnv(env ? JSON.stringify(env.checks ?? {}, null, 2) : null);
      } catch (err) {
        setDoctorOutput(err instanceof Error ? err.message : String(err));
      }
      setDoctorRunning(false);
      return;
    }
    const output = await window.hermesAPI.runHermesDoctor();
    setDoctorOutput(output);
    setDoctorRunning(false);
  }

  function refreshVersion(): void {
    window.hermesAPI.refreshHermesVersion().then((v) => {
      setHermesVersion(v);
      if (v) {
        try {
          localStorage.setItem("hermes-version-cache", v);
        } catch {
          /* ignore */
        }
      }
    });
  }

  async function handleUpdateHermes(): Promise<void> {
    if (serveControlPlane) {
      setUpdateResult("Serve 控制面已启用：请通过 Runtime Repair / 签名安装器恢复 Hermes，不再使用本地 CLI update。");
      setUpdateResultType("error");
      return;
    }
    setUpdating(true);
    setUpdateResult(null);
    const result = await window.hermesAPI.runHermesUpdate();
    setUpdating(false);
    if (result.success) {
      setUpdateResult(t("settings.updateSuccess"));
      setUpdateResultType("success");
      refreshVersion();
    } else {
      setUpdateResult(result.error || t("settings.updateFailed"));
      setUpdateResultType("error");
    }
  }

  const parsedVersion = (() => {
    if (!hermesVersion) return null;
    const v = hermesVersion;
    const version = v.match(/v([\d.]+)/)?.[1] || "";
    const date = v.match(/\(([\d.]+)\)/)?.[1] || "";
    const python = v.match(/Python:\s*([\d.]+)/)?.[1] || "";
    const sdk = v.match(/OpenAI SDK:\s*([\d.]+)/)?.[1] || "";
    const updateMatch = v.match(/Update available:\s*(.+?)(?:\s*—|$)/);
    const updateInfo = updateMatch?.[1]?.trim() || null;
    return { version, date, python, sdk, updateInfo };
  })();

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.sections.hermesAgent")}</div>
      {serveControlPlane ? (
        <p className="settings-field-hint">
          Serve control plane 已启用：Doctor 走 Serve Diagnostics；Update/Debug Dump 的 Hermes CLI 路径已禁用。
        </p>
      ) : null}
      <div className="settings-hermes-info">
        <div className="settings-hermes-row">
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">{t("common.engine")}</span>
            {hermesVersion === null ? (
              <span className="skeleton skeleton-sm" />
            ) : (
              <span className="settings-hermes-value">
                {parsedVersion ? `v${parsedVersion.version}` : t("settings.notDetected")}
              </span>
            )}
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">{t("common.released")}</span>
            {hermesVersion === null ? (
              <span className="skeleton skeleton-sm" />
            ) : (
              <span className="settings-hermes-value">{parsedVersion?.date || "—"}</span>
            )}
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">{t("common.desktop")}</span>
            {!appVersion ? (
              <span className="skeleton skeleton-sm" />
            ) : (
              <span className="settings-hermes-value">
                {t("settings.version", { version: appVersion })}
              </span>
            )}
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">Python</span>
            {hermesVersion === null ? (
              <span className="skeleton skeleton-sm" />
            ) : (
              <span className="settings-hermes-value">{parsedVersion?.python || "—"}</span>
            )}
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">OpenAI SDK</span>
            {hermesVersion === null ? (
              <span className="skeleton skeleton-sm" />
            ) : (
              <span className="settings-hermes-value">{parsedVersion?.sdk || "—"}</span>
            )}
          </div>
          <div className="settings-hermes-detail">
            <span className="settings-hermes-label">{t("common.home")}</span>
            {!hermesHome ? (
              <span className="skeleton skeleton-md" />
            ) : (
              <span className="settings-hermes-value settings-hermes-path">{hermesHome}</span>
            )}
          </div>
        </div>
        {parsedVersion?.updateInfo ? (
          <div className="settings-hermes-update-badge">{parsedVersion.updateInfo}</div>
        ) : null}
        <div className="settings-hermes-actions">
          {parsedVersion?.updateInfo && !serveControlPlane ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleUpdateHermes()}
              disabled={updating}
            >
              {updating ? t("settings.updating") : t("settings.updateEngine")}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" disabled>
              {serveControlPlane ? "Use Runtime Repair" : t("settings.latestVersion")}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleDoctor()}
            disabled={doctorRunning}
          >
            {doctorRunning
              ? t("settings.runningDiagnosis")
              : serveControlPlane
                ? "Serve Diagnostics"
                : t("settings.runDiagnosis")}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              if (serveControlPlane) {
                setDumpOutput("Serve control plane: Hermes CLI dump is disabled. Use Instance Logs / Serve Diagnostics instead.");
                return;
              }
              setDumpRunning(true);
              setDumpOutput(null);
              const output = await window.hermesAPI.runHermesDump();
              setDumpOutput(output);
              setDumpRunning(false);
            }}
            disabled={dumpRunning || serveControlPlane}
          >
            {dumpRunning ? t("settings.running") : t("settings.debugDump")}
          </button>
        </div>
        {updateResult ? (
          <div className={`settings-hermes-result ${updateResultType || "error"}`}>
            {updateResult}
          </div>
        ) : null}
        {doctorOutput ? <pre className="settings-hermes-doctor">{doctorOutput}</pre> : null}
        {diagnosticsEnv ? <pre className="settings-hermes-doctor">{diagnosticsEnv}</pre> : null}
        {dumpOutput ? <pre className="settings-hermes-doctor">{dumpOutput}</pre> : null}
      </div>
    </section>
  );
}
