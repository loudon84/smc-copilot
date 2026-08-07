import { useState, useEffect } from "react";
import { useI18n } from "../useI18n";
import {
  FolderOpen,
  GitBranch,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Spinner,
  X,
} from "../../assets/icons";
import {
  PipMirrorFields,
  createDefaultPipMirrorSelection,
} from "../install/PipMirrorFields";
import "../../screens/Install/install.css";

type WizardStage =
  | "detect"
  | "select-source"
  | "installing"
  | "verifying"
  | "completed"
  | "error";

interface WizardState {
  stage: WizardStage;
  agentInstalled: boolean;
  agentPath?: string;
  error?: string;
}

interface InstallProgress {
  stage: string;
  message: string;
}

type SourceType = "local-zip" | "git-clone";

interface InstallWizardProps {
  onComplete: () => void;
  onCancel?: () => void;
}

function InstallWizard({
  onComplete,
  onCancel,
}: InstallWizardProps): React.JSX.Element {
  const { t } = useI18n();
  const [state, setState] = useState<WizardState>({
    stage: "detect",
    agentInstalled: false,
  });
  const [progress, setProgress] = useState<InstallProgress>({
    stage: "",
    message: "",
  });
  const [sourceType, setSourceType] = useState<SourceType>("local-zip");
  const [localZipPath, setLocalZipPath] = useState("");
  const [gitUrl, setGitUrl] = useState(
    "http://git.superic.com/aiplatform/hermes-agent.git",
  );
  const [gitBranch, setGitBranch] = useState("main");
  const [gitShallow, setGitShallow] = useState(true);
  const [pipMirror, setPipMirror] = useState(createDefaultPipMirrorSelection);
  const [error, setError] = useState("");

  useEffect(() => {
    detectAgent();
  }, []);

  useEffect(() => {
    const cleanup = window.hermesAPI.onInstallProgress?.((p) => {
      setProgress({ stage: String(p.step), message: p.detail || p.title });
    });
    return () => {
      cleanup?.();
    };
  }, []);

  async function detectAgent(): Promise<void> {
    try {
      const result = await window.hermesAPI.firstRunWizardDetectAgent();
      if (result.agentInstalled) {
        setState({
          stage: "completed",
          agentInstalled: true,
          agentPath: result.agentPath,
        });
      } else {
        setState({ stage: "select-source", agentInstalled: false });
      }
    } catch {
      setState({ stage: "select-source", agentInstalled: false });
    }
  }

  async function handleBrowse(): Promise<void> {
    try {
      const result = await window.hermesAPI.showOpenDialog({
        title: "Select Hermes Agent ZIP",
        filters: [{ name: "ZIP", extensions: ["zip"] }],
        properties: ["openFile"],
      });
      if (result && !result.canceled && result.filePaths.length > 0) {
        setLocalZipPath(result.filePaths[0]);
        setError("");
      }
    } catch {
      /* non-fatal */
    }
  }

  async function handleStartInstall(): Promise<void> {
    if (sourceType === "local-zip" && !localZipPath.trim()) {
      setError(t("install.zipPathRequired") || "Please select a ZIP file");
      return;
    }
    if (sourceType === "git-clone" && !gitUrl.trim()) {
      setError(t("install.gitUrlRequired") || "Please enter a Git URL");
      return;
    }
    if (pipMirror.pipMirrorPreset === "custom" && !pipMirror.pipIndexUrl.trim()) {
      setError(t("install.pipMirrorUrlRequired") || "Please enter a PyPI mirror URL");
      return;
    }

    setError("");
    setState({ ...state, stage: "installing" });

    const config = {
      sourceType,
      localZipPath: sourceType === "local-zip" ? localZipPath : undefined,
      gitUrl: sourceType === "git-clone" ? gitUrl : undefined,
      gitBranch: sourceType === "git-clone" ? gitBranch : undefined,
      gitShallow: sourceType === "git-clone" ? gitShallow : undefined,
      pipMirrorPreset: pipMirror.pipMirrorPreset,
      pipIndexUrl: pipMirror.pipIndexUrl,
      trustedHost: pipMirror.trustedHost,
    };

    try {
      const result = await window.hermesAPI.startInstallWithSource(config);
      if (result.success) {
        setState({ stage: "completed", agentInstalled: true });
      } else {
        setState({
          stage: "error",
          agentInstalled: false,
          error: result.error,
        });
      }
    } catch (err) {
      setState({
        stage: "error",
        agentInstalled: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleRetry(): void {
    setState({
      stage: "select-source",
      agentInstalled: false,
      error: undefined,
    });
    setError("");
  }

  return (
    <div className="install-wizard-screen">
      <div className="install-wizard-card">
        <div className="install-wizard-header">
          <h1 className="install-wizard-title">
            {t("install.agentSourceTitle") || "Install SMC-Copilot"}
          </h1>
          {onCancel && (
            <button
              type="button"
              className="install-wizard-close"
              onClick={onCancel}
            >
              <X className="install-icon-sm" />
            </button>
          )}
        </div>

        {state.stage === "detect" && (
          <div className="install-wizard-status">
            <Spinner className="install-icon-sm install-spin" />
            <span>{t("install.detecting") || "Detecting installation..."}</span>
          </div>
        )}

        {state.stage === "select-source" && (
          <>
            <p className="install-source-desc">
              {t("install.agentSourceDesc") ||
                "Select how to obtain the agent source code"}
            </p>

            <div className="install-source-options">
              <button
                type="button"
                className={`install-source-option ${
                  sourceType === "local-zip" ? "install-source-option--active" : ""
                }`}
                onClick={() => setSourceType("local-zip")}
              >
                <FolderOpen className="install-source-option-icon" />
                <div className="install-source-option-body">
                  <div className="install-source-option-title">
                    {t("install.fromLocalZip") || "From Local ZIP"}
                  </div>
                  <div className="install-source-option-desc">
                    {t("install.fromLocalZipDesc") ||
                      "Select a local ZIP file, no network needed"}
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`install-source-option ${
                  sourceType === "git-clone" ? "install-source-option--active" : ""
                }`}
                onClick={() => setSourceType("git-clone")}
              >
                <GitBranch className="install-source-option-icon" />
                <div className="install-source-option-body">
                  <div className="install-source-option-title">
                    {t("install.fromGitClone") || "From Git Repository"}
                  </div>
                  <div className="install-source-option-desc">
                    {t("install.fromGitCloneDesc") ||
                      "Clone from GitHub or private repo"}
                  </div>
                </div>
              </button>
            </div>

            {sourceType === "local-zip" && (
              <div className="install-source-section">
                <label className="install-source-label">
                  {t("install.zipFilePath") || "ZIP File Path"}
                </label>
                <div className="install-source-row">
                  <input
                    type="text"
                    className="install-form-input"
                    value={localZipPath}
                    onChange={(e) => {
                      setLocalZipPath(e.target.value);
                      setError("");
                    }}
                    placeholder="C:\path\to\hermes-agent.zip"
                  />
                  <button
                    type="button"
                    className="install-btn install-btn-secondary"
                    onClick={handleBrowse}
                  >
                    {t("install.browse") || "Browse"}
                  </button>
                </div>
              </div>
            )}

            {sourceType === "git-clone" && (
              <div className="install-source-section">
                <label className="install-source-label">
                  {t("install.gitUrl") || "Git URL"}
                </label>
                <input
                  type="text"
                  className="install-form-input"
                  value={gitUrl}
                  onChange={(e) => {
                    setGitUrl(e.target.value);
                    setError("");
                  }}
                  placeholder="http://git.superic.com/aiplatform/hermes-agent.git"
                />
                <div className="install-source-git-grid">
                  <div className="install-source-section">
                    <label className="install-source-label">
                      {t("install.gitBranch") || "Branch"}
                    </label>
                    <input
                      type="text"
                      className="install-form-input"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                      placeholder="main"
                    />
                  </div>
                  <label className="install-source-checkbox">
                    <input
                      type="checkbox"
                      checked={gitShallow}
                      onChange={(e) => setGitShallow(e.target.checked)}
                    />
                    {t("install.shallowClone") || "Shallow"}
                  </label>
                </div>
              </div>
            )}

            <PipMirrorFields value={pipMirror} onChange={setPipMirror} />

            {error && (
              <div className="install-source-error">
                <AlertTriangle className="install-icon-sm" />
                {error}
              </div>
            )}

            <button
              type="button"
              className="install-btn install-btn-primary"
              onClick={handleStartInstall}
            >
              {t("install.startInstall") || "Start Install"}
              <ArrowRight className="install-icon-sm" />
            </button>
          </>
        )}

        {state.stage === "installing" && (
          <>
            <div className="install-wizard-status">
              <Spinner className="install-icon-sm install-spin" />
              <span>{t("install.installing") || "Installing..."}</span>
            </div>
            {progress.message && (
              <p className="install-wizard-message">{progress.message}</p>
            )}
            <button
              type="button"
              className="install-btn install-btn-secondary"
              onClick={() => setState({ ...state, stage: "select-source" })}
            >
              {t("common.cancel") || "Cancel"}
            </button>
          </>
        )}

        {state.stage === "verifying" && (
          <div className="install-wizard-status">
            <Spinner className="install-icon-sm install-spin" />
            <span>{t("install.verifying") || "Verifying installation..."}</span>
          </div>
        )}

        {state.stage === "completed" && (
          <div className="install-wizard-center">
            <CheckCircle className="install-wizard-success-icon" />
            <h2 className="install-wizard-subtitle">
              {t("install.completed") || "Installation Complete"}
            </h2>
            <button
              type="button"
              className="install-btn install-btn-primary"
              onClick={onComplete}
            >
              {t("install.launchApp") || "Launch SMC-Copilot"}
            </button>
          </div>
        )}

        {state.stage === "error" && (
          <div className="install-wizard-center">
            <AlertTriangle className="install-wizard-error-icon" />
            <h2 className="install-wizard-subtitle">
              {t("install.failed") || "Installation Failed"}
            </h2>
            {state.error && (
              <p className="install-wizard-error-text">{state.error}</p>
            )}
            <button
              type="button"
              className="install-btn install-btn-primary"
              onClick={handleRetry}
            >
              {t("install.retry") || "Retry"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { InstallWizard };
