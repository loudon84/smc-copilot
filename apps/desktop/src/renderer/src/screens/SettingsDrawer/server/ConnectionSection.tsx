import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../../components/useI18n";
import { makeApiKeyMask } from "../settings-shared";

export function ConnectionSection(): React.JSX.Element {
  const { t } = useI18n();
  const [connMode, setConnMode] = useState<"local" | "remote" | "ssh">("local");
  const [connRemoteUrl, setConnRemoteUrl] = useState("");
  const [connApiKey, setConnApiKey] = useState("");
  const [connApiKeyMask, setConnApiKeyMask] = useState("");
  const [connHasApiKey, setConnHasApiKey] = useState(false);
  const [connTesting, setConnTesting] = useState(false);
  const [connStatus, setConnStatus] = useState<string | null>(null);
  const connLoaded = useRef(false);

  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [sshRemotePort, setSshRemotePort] = useState("");

  const loadConnection = useCallback(async (): Promise<void> => {
    const conn = await window.hermesAPI.getConnectionConfig();
    setConnMode(conn.mode);
    setConnRemoteUrl(conn.remoteUrl);
    setConnHasApiKey(conn.hasApiKey);
    const mask = conn.hasApiKey ? makeApiKeyMask(conn.apiKeyLength) : "";
    setConnApiKeyMask(mask);
    setConnApiKey(mask);
    setSshHost(conn.ssh?.host || "");
    setSshPort(conn.ssh?.port ? String(conn.ssh.port) : "");
    setSshUser(conn.ssh?.username || "");
    setSshKeyPath(conn.ssh?.keyPath || "");
    setSshRemotePort(conn.ssh?.remotePort ? String(conn.ssh.remotePort) : "");
    connLoaded.current = true;
  }, []);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  function getConnectionApiKeyForSave(): string | undefined {
    if (connHasApiKey && connApiKey === connApiKeyMask) {
      return undefined;
    }
    return connApiKey.trim();
  }

  async function handleSaveConnection(): Promise<void> {
    if (connMode === "ssh") {
      await window.hermesAPI.setSshConfig(
        sshHost.trim(),
        parseInt(sshPort, 10) || 22,
        sshUser.trim(),
        sshKeyPath.trim(),
        parseInt(sshRemotePort, 10) || 8642,
        18642,
      );
    } else {
      const apiKey = getConnectionApiKeyForSave();
      await window.hermesAPI.setConnectionConfig(connMode, connRemoteUrl, apiKey);
      if (apiKey !== undefined) {
        const hasApiKey = apiKey.length > 0;
        setConnHasApiKey(hasApiKey);
        if (hasApiKey) {
          const mask = makeApiKeyMask(apiKey.length);
          setConnApiKeyMask(mask);
          setConnApiKey(mask);
        } else {
          setConnApiKeyMask("");
        }
      }
    }
    setConnStatus("Saved");
    setTimeout(() => setConnStatus(null), 2000);
  }

  async function handleTestConnection(): Promise<void> {
    if (connMode === "ssh") {
      if (!sshHost.trim() || !sshUser.trim()) {
        setConnStatus("Host and username are required");
        return;
      }
      setConnTesting(true);
      setConnStatus(null);
      const ok = await window.hermesAPI.testSshConnection(
        sshHost.trim(),
        parseInt(sshPort, 10) || 22,
        sshUser.trim(),
        sshKeyPath.trim(),
        parseInt(sshRemotePort, 10) || 8642,
      );
      setConnTesting(false);
      setConnStatus(ok ? "SSH tunnel connected!" : "Could not connect via SSH");
    } else {
      const url = connRemoteUrl.trim();
      if (!url) {
        setConnStatus("Please enter a URL");
        return;
      }
      setConnTesting(true);
      setConnStatus(null);
      const ok = await window.hermesAPI.testRemoteConnection(url, getConnectionApiKeyForSave());
      setConnTesting(false);
      setConnStatus(ok ? "Connected successfully!" : "Could not reach server");
    }
  }

  async function handleSwitchToLocal(): Promise<void> {
    setConnMode("local");
    setConnRemoteUrl("");
    setConnApiKey("");
    setConnApiKeyMask("");
    setConnHasApiKey(false);
    await window.hermesAPI.setConnectionConfig("local", "", "");
    setConnStatus(t("settings.switchedToLocal"));
    setTimeout(() => setConnStatus(null), 2000);
  }

  return (
    <section className="settings-section">
      <div className="settings-section-title">
        {t("settings.connectionSection")}
        {connStatus ? (
          <span className="settings-saved" style={{ marginLeft: 8 }}>
            {connStatus}
          </span>
        ) : null}
      </div>

      <div className="settings-field">
        <label className="settings-field-label">{t("settings.connectionMode")}</label>
        <div className="settings-theme-options">
          <button
            type="button"
            className={`settings-theme-option ${connMode === "local" ? "active" : ""}`}
            onClick={() => {
              setConnMode("local");
              if (connLoaded.current) void handleSwitchToLocal();
            }}
          >
            {t("settings.modeLocal")}
          </button>
          <button
            type="button"
            className={`settings-theme-option ${connMode === "remote" ? "active" : ""}`}
            onClick={() => setConnMode("remote")}
          >
            {t("settings.modeRemote")}
          </button>
          <button
            type="button"
            className={`settings-theme-option ${connMode === "ssh" ? "active" : ""}`}
            onClick={() => setConnMode("ssh")}
          >
            SSH Tunnel
          </button>
        </div>
        <div className="settings-field-hint">
          {connMode === "local"
            ? t("settings.modeLocalHint")
            : connMode === "ssh"
              ? "Tunnel to a remote Hermes over SSH — no exposed ports or API keys needed."
              : t("settings.modeRemoteHint")}
        </div>
      </div>

      {connMode === "remote" ? (
        <>
          <div className="settings-field">
            <label className="settings-field-label">{t("settings.remoteUrl")}</label>
            <input
              className="input"
              type="url"
              value={connRemoteUrl}
              onChange={(e) => setConnRemoteUrl(e.target.value)}
              placeholder="http://192.168.1.100:8642"
              onBlur={() => void handleSaveConnection()}
            />
            <div className="settings-field-hint">{t("settings.remoteUrlHint")}</div>
          </div>
          <div className="settings-field">
            <label className="settings-field-label">{t("settings.remoteApiKey")}</label>
            <input
              className="input"
              type="password"
              value={connApiKey}
              onChange={(e) => setConnApiKey(e.target.value)}
              onFocus={(e) => {
                if (connApiKey === connApiKeyMask) {
                  e.currentTarget.select();
                }
              }}
              placeholder={t("settings.remoteApiKey")}
              onBlur={() => void handleSaveConnection()}
            />
            <div className="settings-field-hint">{t("settings.remoteApiKeyHint")}</div>
          </div>
          <div className="settings-hermes-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleTestConnection()}
              disabled={connTesting}
            >
              {connTesting ? t("settings.testingConnection") : t("settings.testConnection")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handleSaveConnection()}>
              {t("settings.save")}
            </button>
          </div>
        </>
      ) : null}

      {connMode === "ssh" ? (
        <>
          <div className="settings-field">
            <label className="settings-field-label">SSH Host</label>
            <input
              className="input"
              type="text"
              value={sshHost}
              onChange={(e) => setSshHost(e.target.value)}
              placeholder="192.168.1.100 or myserver.local"
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">SSH Port</label>
            <input
              className="input"
              type="number"
              value={sshPort}
              onChange={(e) => setSshPort(e.target.value)}
              placeholder="22"
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">Username</label>
            <input
              className="input"
              type="text"
              value={sshUser}
              onChange={(e) => setSshUser(e.target.value)}
              placeholder="hermes"
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">
              Private Key Path{" "}
              <span style={{ fontWeight: 400, opacity: 0.6 }}>
                (optional, defaults to ~/.ssh/id_rsa)
              </span>
            </label>
            <input
              className="input"
              type="text"
              value={sshKeyPath}
              onChange={(e) => setSshKeyPath(e.target.value)}
              placeholder="~/.ssh/id_rsa"
            />
          </div>
          <div className="settings-field">
            <label className="settings-field-label">
              Remote Hermes Port{" "}
              <span style={{ fontWeight: 400, opacity: 0.6 }}>(default 8642)</span>
            </label>
            <input
              className="input"
              type="number"
              value={sshRemotePort}
              onChange={(e) => setSshRemotePort(e.target.value)}
              placeholder="8642"
            />
          </div>
          <div className="settings-hermes-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleTestConnection()}
              disabled={connTesting}
            >
              {connTesting ? "Testing SSH…" : "Test SSH Connection"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handleSaveConnection()}>
              {t("settings.save")}
            </button>
          </div>
        </>
      ) : null}

      {connMode === "remote" ? (
        <div className="settings-field" style={{ marginTop: 12 }}>
          <div className="settings-section-title">{t("settings.serverConfigTitle")}</div>
          <div
            className="settings-field-hint"
            dangerouslySetInnerHTML={{ __html: t("settings.serverConfigHint") }}
          />
        </div>
      ) : null}
    </section>
  );
}
