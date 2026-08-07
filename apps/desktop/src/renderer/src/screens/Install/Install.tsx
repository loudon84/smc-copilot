import { useEffect, useState, useRef } from "react";
import { ArrowRight, Copy } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import "./install.css";
import { AgentSourceSelect } from "./AgentSourceSelect";
import type { AgentSourceConfig } from "./AgentSourceSelect";

interface InstallProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

interface InstallProps {
  onComplete: () => void;
  onFailed: (error: string) => void;
}

function Install({ onComplete, onFailed }: InstallProps): React.JSX.Element {
  const { t } = useI18n();
  const [sourceSelected, setSourceSelected] = useState(false);
  const [progress, setProgress] = useState<InstallProgress>({
    step: 0,
    totalSteps: 7,
    title: t("install.preparing"),
    detail: t("install.startingInstall"),
    log: "",
  });
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanup = window.hermesAPI.onInstallProgress((p) => {
      setProgress(p);
    });
    return cleanup;
  }, []);

  function handleSourceConfirm(config: AgentSourceConfig): void {
    setSourceSelected(true);
    startInstallWithSource(config);
  }

  function startInstallWithSource(config: AgentSourceConfig): void {
    window.hermesAPI
      .startInstallWithSource(config)
      .then((result: { success: boolean; error?: string }) => {
        if (result.success) {
          setDone(true);
        } else {
          setFailed(result.error || t("install.installationFailedHint"));
        }
      })
      .catch((err: Error) => {
        setFailed(err.message || t("install.installationFailedHint"));
      });
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress.log]);

  function handleCopyLogs(): void {
    const text = `Installation Error:\n${failed}\n\n--- Full Log ---\n${progress.log}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRetry(): void {
    setFailed(null);
    setSourceSelected(false);
    setProgress({
      step: 0,
      totalSteps: 7,
      title: t("install.preparing"),
      detail: t("install.startingInstall"),
      log: "",
    });
  }

  if (!sourceSelected) {
    return (
      <AgentSourceSelect
        onConfirm={handleSourceConfirm}
        onCancel={() => onFailed("cancelled")}
      />
    );
  }

  const percent =
    progress.totalSteps > 0
      ? Math.round((progress.step / progress.totalSteps) * 100)
      : 0;

  return (
    <div className="screen install-screen">
      <h1 className="install-title">
        {done
          ? t("install.installationComplete")
          : failed
            ? t("install.installationFailed")
            : t("install.installingHermes")}
      </h1>

      <div className="install-progress-container">
        <div className="install-progress-bar">
          <div
            className={`install-progress-fill ${failed ? "install-progress-fill--error" : ""}`}
            style={{ width: `${done ? 100 : percent}%` }}
          />
        </div>
        <div className="install-percent">{done ? "100" : percent}%</div>
      </div>

      {failed && (
        <div className="install-error-banner">
          <p className="install-error-text">{failed}</p>
          <div className="install-error-actions">
            <button
              type="button"
              className="install-btn install-btn-primary install-btn-sm"
              onClick={handleRetry}
            >
              {t("install.retryInstallation")}
            </button>
            <button
              type="button"
              className="install-btn install-btn-secondary install-btn-sm"
              onClick={handleCopyLogs}
            >
              <Copy size={13} />
              {copied ? t("install.copied") : t("install.copyLogs")}
            </button>
          </div>
        </div>
      )}

      {!done && !failed && (
        <div className="install-step-info">
          <div className="install-step-title">
            {t("install.stepLabel", {
              step: progress.step,
              total: progress.totalSteps,
              title: progress.title,
            })}
          </div>
          <div className="install-step-detail">{progress.detail}</div>
        </div>
      )}

      <div className="install-log" ref={logRef}>
        {progress.log || t("install.waitingToStart")}
      </div>

      {done && (
        <div className="install-done">
          <button
            type="button"
            className="install-btn install-btn-primary"
            onClick={onComplete}
          >
            {t("install.continueToSetup")}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default Install;
