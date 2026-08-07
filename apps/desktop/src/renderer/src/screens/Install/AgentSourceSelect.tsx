import { useState } from "react";

import { useI18n } from "../../components/useI18n";

import {

  FolderOpen,

  GitBranch,

  ArrowRight,

  AlertTriangle,

} from "../../assets/icons";

import {

  PipMirrorFields,

  createDefaultPipMirrorSelection,

  type PipMirrorSelection,

} from "../../components/install/PipMirrorFields";



export type AgentSourceType = "local-zip" | "git-clone";



export interface AgentSourceConfig {

  sourceType: AgentSourceType;

  localZipPath: string;

  gitUrl: string;

  gitBranch: string;

  gitShallow: boolean;

  pipMirrorPreset: PipMirrorSelection["pipMirrorPreset"];

  pipIndexUrl: string;

  trustedHost: string;

}



interface AgentSourceSelectProps {

  onConfirm: (config: AgentSourceConfig) => void;

  onCancel?: () => void;

}



function AgentSourceSelect({ onConfirm, onCancel }: AgentSourceSelectProps): React.JSX.Element {

  const { t } = useI18n();

  const [sourceType, setSourceType] = useState<AgentSourceType>("local-zip");

  const [localZipPath, setLocalZipPath] = useState("");

  const [gitUrl, setGitUrl] = useState("http://git.superic.com/aiplatform/hermes-agent.git");

  const [gitBranch, setGitBranch] = useState("main");

  const [gitShallow, setGitShallow] = useState(true);

  const [pipMirror, setPipMirror] = useState(createDefaultPipMirrorSelection);

  const [error, setError] = useState("");



  async function handleBrowse(): Promise<void> {

    try {

      const path = await window.hermesAPI.showOpenDialog({

        title: t("install.selectAgentZip") || "选择 hermes-agent.zip",

        filters: [{ name: "ZIP", extensions: ["zip"] }],

        properties: ["openFile"],

      });

      if (path && !path.canceled && path.filePaths.length > 0) {

        setLocalZipPath(path.filePaths[0]);

        setError("");

      }

    } catch { /* non-fatal */ }

  }



  function handleConfirm(): void {

    if (

      pipMirror.pipMirrorPreset === "custom" &&

      !pipMirror.pipIndexUrl.trim()

    ) {

      setError(t("install.pipMirrorUrlRequired") || "请填写 PyPI 镜像地址");

      return;

    }



    if (sourceType === "local-zip") {

      if (!localZipPath.trim()) {

        setError(t("install.zipPathRequired") || "请选择或输入 zip 文件路径");

        return;

      }

    } else {

      if (!gitUrl.trim()) {

        setError(t("install.gitUrlRequired") || "请输入 Git 仓库地址");

        return;

      }

    }

    setError("");

    onConfirm({

      sourceType,

      localZipPath,

      gitUrl,

      gitBranch,

      gitShallow,

      pipMirrorPreset: pipMirror.pipMirrorPreset,

      pipIndexUrl: pipMirror.pipIndexUrl,

      trustedHost: pipMirror.trustedHost,

    });

  }



  return (

    <div className="install-source-screen">

      <div className="install-source-card">

        <div className="install-source-header">

          <h1 className="install-source-title">

            {t("install.agentSourceTitle") || "安装 SMC-Copilot"}

          </h1>

          <p className="install-source-desc">

            {t("install.agentSourceDesc") || "选择 SMC-Copilot 源码的获取方式"}

          </p>

        </div>



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

                {t("install.fromLocalZip") || "从本地 ZIP 文件"}

              </div>

              <div className="install-source-option-desc">

                {t("install.fromLocalZipDesc") || "选择本地的 hermes-agent.zip 解压安装，无需网络"}

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

                {t("install.fromGitClone") || "从 Git 仓库克隆"}

              </div>

              <div className="install-source-option-desc">

                {t("install.fromGitCloneDesc") || "从 GitHub 或私有 Git 仓库克隆源码，需要网络和 Git"}

              </div>

            </div>

          </button>

        </div>



        {sourceType === "local-zip" && (

          <div className="install-source-section">

            <label className="install-source-label">

              {t("install.zipFilePath") || "ZIP 文件路径"}

            </label>

            <div className="install-source-row">

              <input

                type="text"

                className="install-form-input"

                value={localZipPath}

                onChange={(e) => { setLocalZipPath(e.target.value); setError(""); }}

                placeholder="C:\path\to\hermes-agent.zip"

              />

              <button

                type="button"

                className="install-btn install-btn-secondary"

                onClick={handleBrowse}

              >

                {t("install.browse") || "浏览"}

              </button>

            </div>

            <p className="install-source-hint">

              {t("install.zipHint") || "支持官方发布包或内部构建的 hermes-agent.zip"}

            </p>

          </div>

        )}



        {sourceType === "git-clone" && (

          <div className="install-source-section">

            <label className="install-source-label">

              {t("install.gitUrl") || "Git 仓库地址"}

            </label>

            <input

              type="text"

              className="install-form-input"

              value={gitUrl}

              onChange={(e) => { setGitUrl(e.target.value); setError(""); }}

              placeholder="http://git.superic.com/aiplatform/hermes-agent.git"

            />



            <div className="install-source-git-grid">

              <div className="install-source-section">

                <label className="install-source-label">

                  {t("install.gitBranch") || "分支"}

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

                {t("install.shallowClone") || "浅克隆"}

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



        <div className="install-source-actions">

          {onCancel && (

            <button

              type="button"

              className="install-btn install-btn-secondary"

              onClick={onCancel}

            >

              {t("common.cancel") || "取消"}

            </button>

          )}

          <button

            type="button"

            className="install-btn install-btn-primary"

            onClick={handleConfirm}

          >

            {t("install.startInstall") || "开始安装"}

            <ArrowRight className="install-icon-sm" />

          </button>

        </div>

      </div>

    </div>

  );

}



export { AgentSourceSelect };

