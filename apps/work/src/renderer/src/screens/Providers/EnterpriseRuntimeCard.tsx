import { useEffect, useState } from "react";
import { useI18n } from "../../components/useI18n";
import {
  enterpriseRuntimeHidesDiagnostics,
  recoveryActions,
  type RuntimeProviderDiagnosticsSnapshot,
} from "../../../../shared/runtime-provider-diagnostics";

type DiagnosticsResult =
  | { ok: true; snapshot: RuntimeProviderDiagnosticsSnapshot }
  | { ok: false; error: "RUNTIME_DIAGNOSTICS_UNAVAILABLE" }
  | null;

export default function EnterpriseRuntimeCard({
  profile,
  visible = true,
  onOpenGateway,
}: {
  profile?: string;
  visible?: boolean;
  onOpenGateway?: () => void;
}): React.JSX.Element | null {
  const { t } = useI18n();
  const [result, setResult] = useState<DiagnosticsResult>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const load = () => {
      void window.hermesAPI.getRuntimeProviderDiagnostics(profile).then((next) => {
        if (!cancelled) setResult(next as DiagnosticsResult);
      });
    };
    load();
    const unsubscribe = window.hermesAPI.onRuntimeProviderStateChanged(() => load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [profile, visible]);

  if (!result) return null;
  if (!result.ok) {
    return (
      <section className="settings-section" data-testid="enterprise-runtime-card">
        <h3>{t("providers.enterpriseRuntime.title")}</h3>
        <p>{t("providers.enterpriseRuntime.unavailable")}</p>
      </section>
    );
  }
  const snapshot = result.snapshot;
  if (
    snapshot.connection.mode !== "local" ||
    !snapshot.connection.authenticatedSessionPresent ||
    snapshot.runtimeProvider.state === "UNBOUND"
  ) {
    return null;
  }
  const actions = recoveryActions({
    runtimeState: snapshot.runtimeProvider.state,
    errorCode: snapshot.runtimeProvider.errorCode,
    gatewayHealthy: snapshot.gateway.gatewayHealthy,
  });
  const quiet = enterpriseRuntimeHidesDiagnostics({
    summaryStatus: snapshot.summaryStatus,
    runtimeState: snapshot.runtimeProvider.state,
    projectionStatus: snapshot.projection.status,
    gatewayHealthy: snapshot.gateway.gatewayHealthy,
  });
  const credential = snapshot.runtimeProvider.managedSecretPresent
    ? t("providers.enterpriseRuntime.secretLoaded")
    : t("providers.enterpriseRuntime.secretMissing");
  return (
    <section className="settings-section" data-testid="enterprise-runtime-card">
      <h3>{t("providers.enterpriseRuntime.title")}</h3>
      <p>{t("providers.enterpriseRuntime.managed")}</p>
      {actions.includes("adminGuidance") ? (
        <p>{t("providers.enterpriseRuntime.notReady")}</p>
      ) : null}
      {quiet ? <p>{credential}</p> : (
        <dl>
          <div>
            <dt>Summary</dt>
            <dd>{snapshot.summaryStatus}</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>{snapshot.runtimeProvider.state}</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>{snapshot.runtimeProvider.backendState || snapshot.runtimeProvider.errorCode || ""}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>SMC Enterprise Model</dd>
          </div>
          <div>
            <dt>Default model</dt>
            <dd>{snapshot.runtimeProvider.defaultModel || ""}</dd>
          </div>
          <div>
            <dt>Models</dt>
            <dd>{snapshot.runtimeProvider.modelCount}</dd>
          </div>
          <div>
            <dt>Last sync</dt>
            <dd>{snapshot.reconcile.lastSuccessfulFetchAt || ""}</dd>
          </div>
          <div>
            <dt>Next reconcile</dt>
            <dd>{snapshot.reconcile.nextDueAt || ""}</dd>
          </div>
          <div>
            <dt>Scheduler</dt>
            <dd>{snapshot.reconcile.schedulerState}</dd>
          </div>
          <div>
            <dt>Gateway</dt>
            <dd>{snapshot.gateway.gatewayHealthy === false ? "unhealthy" : snapshot.gateway.observed ? "healthy" : "unknown"}</dd>
          </div>
          <div>
            <dt>Projection</dt>
            <dd>{snapshot.projection.status}</dd>
          </div>
          <div>
            <dt>Credential</dt>
            <dd>{credential}</dd>
          </div>
        </dl>
      )}
      {quiet ? null : (
        <>
          {actions.includes("reconcile") ? (
            <button type="button" onClick={() => void window.hermesAPI.refreshRuntimeProvider()}>
              {t("providers.enterpriseRuntime.reconcile")}
            </button>
          ) : null}
          {actions.includes("retry") ? (
            <button type="button" onClick={() => void window.hermesAPI.refreshRuntimeProvider()}>
              {t("providers.enterpriseRuntime.retry")}
            </button>
          ) : null}
          {actions.includes("export") ? (
            <button type="button" onClick={() => void window.hermesAPI.exportRuntimeProviderDiagnostics(profile)}>
              {t("providers.enterpriseRuntime.export")}
            </button>
          ) : null}
          {actions.includes("openGateway") ? (
            <button type="button" onClick={() => onOpenGateway?.()}>
              {t("providers.enterpriseRuntime.openGateway")}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
