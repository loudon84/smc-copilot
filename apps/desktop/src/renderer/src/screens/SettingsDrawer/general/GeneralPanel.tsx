import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Send, Upload } from "lucide-react";
import { useTheme } from "../../../components/ThemeProvider";
import { THEME_OPTIONS } from "../../../constants";
import { useI18n } from "../../../components/useI18n";
import { getCachedOpenClaw } from "../settings-shared";
import { LanguageSelect } from "./LanguageSelect";

const TELEGRAM_COMMUNITY_URL = "https://t.me/hermes_agent_desktop";

export interface GeneralPanelProps {
  activeProfile: string;
}

export function GeneralPanel({ activeProfile }: GeneralPanelProps): React.JSX.Element {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  const cachedClaw = getCachedOpenClaw();
  const [openclawFound, setOpenclawFound] = useState(cachedClaw?.found ?? false);
  const [openclawPath, setOpenclawPath] = useState<string | null>(cachedClaw?.path ?? null);
  const [migrationDismissed, setMigrationDismissed] = useState(
    () => localStorage.getItem("hermes-openclaw-dismissed") === "true",
  );
  const [migrating, setMigrating] = useState(false);
  const [migrationLog, setMigrationLog] = useState("");
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [migrationResultType, setMigrationResultType] = useState<"success" | "error" | null>(
    null,
  );
  const migrationLogRef = useRef<HTMLPreElement>(null);

  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [logContent, setLogContent] = useState("");
  const [logFile, setLogFile] = useState("gateway.log");
  const [logPath, setLogPath] = useState("");
  const [logsExpanded, setLogsExpanded] = useState(false);

  const [forceIpv4, setForceIpv4] = useState(false);
  const [httpProxy, setHttpProxy] = useState("");
  const [networkSaved, setNetworkSaved] = useState(false);

  const loadConfig = useCallback(async (): Promise<void> => {
    window.hermesAPI.getConfig("network.force_ipv4", activeProfile).then((v) => {
      setForceIpv4(v === "true" || v === "True");
    });
    window.hermesAPI.getConfig("network.proxy", activeProfile).then((v) => {
      setHttpProxy(v || "");
    });

    if (localStorage.getItem("hermes-openclaw-dismissed") !== "true") {
      window.hermesAPI.checkOpenClaw().then((claw) => {
        setOpenclawFound(claw.found);
        setOpenclawPath(claw.path);
        try {
          localStorage.setItem("hermes-openclaw-cache", JSON.stringify(claw));
        } catch {
          /* ignore */
        }
      });
    }
  }, [activeProfile]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleMigrate(): Promise<void> {
    setMigrating(true);
    setMigrationLog("");
    setMigrationResult(null);

    const cleanup = window.hermesAPI.onInstallProgress((p) => {
      setMigrationLog(p.log);
    });

    try {
      const result = await window.hermesAPI.runClawMigrate();
      cleanup();
      if (result.success) {
        setMigrationResult(t("settings.migrationComplete"));
        setMigrationResultType("success");
        setOpenclawFound(false);
      } else {
        setMigrationResult(result.error || t("settings.migrationFailed"));
        setMigrationResultType("error");
      }
    } catch (err) {
      cleanup();
      setMigrationResult((err as Error).message || t("settings.migrationFailed"));
      setMigrationResultType("error");
    }
    setMigrating(false);
  }

  function handleDismissMigration(): void {
    localStorage.setItem("hermes-openclaw-dismissed", "true");
    setMigrationDismissed(true);
  }

  async function handleBackup(): Promise<void> {
    setBackingUp(true);
    setBackupResult(null);
    const result = await window.hermesAPI.runHermesBackup(activeProfile);
    setBackingUp(false);
    if (result.success) {
      setBackupResult(`Backup created: ${result.path || "success"}`);
    } else {
      setBackupResult(result.error || "Backup failed.");
    }
  }

  async function handleImport(): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".tar.gz,.tgz,.zip";
    input.onchange = async (): Promise<void> => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      setImportResult(null);
      const filePath = (file as File & { path: string }).path;
      const result = await window.hermesAPI.runHermesImport(filePath, activeProfile);
      setImporting(false);
      if (result.success) {
        setImportResult(t("settings.migrationComplete"));
      } else {
        setImportResult(result.error || t("settings.migrationFailed"));
      }
    };
    input.click();
  }

  async function loadLogs(): Promise<void> {
    const result = await window.hermesAPI.readLogs(logFile, 300);
    setLogContent(result.content);
    setLogPath(result.path);
  }

  return (
    <div className="settings-drawer-scroll settings-drawer-padded">
      <div className="settings-container">
        {openclawFound && !migrationDismissed ? (
          <div className="settings-migration-banner">
            <div className="settings-migration-header">
              <div>
                <div className="settings-migration-title">{t("settings.migrationDetected")}</div>
                <div
                  className="settings-migration-desc"
                  dangerouslySetInnerHTML={{
                    __html: t("settings.migrationDesc", { path: openclawPath || "" }),
                  }}
                />
              </div>
              <button
                type="button"
                className="btn-ghost settings-migration-dismiss"
                onClick={handleDismissMigration}
                title={t("settings.migrationDismiss")}
              >
                &times;
              </button>
            </div>
            {migrationLog ? (
              <pre className="settings-hermes-doctor" ref={migrationLogRef}>
                {migrationLog}
              </pre>
            ) : null}
            {migrationResult ? (
              <div className={`settings-hermes-result ${migrationResultType || "error"}`}>
                {migrationResult}
              </div>
            ) : null}
            <div className="settings-migration-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleMigrate()}
                disabled={migrating}
              >
                {migrating ? t("settings.migrating") : t("settings.migrateToHermes")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleDismissMigration}>
                {t("settings.skip")}
              </button>
            </div>
          </div>
        ) : null}

        <section className="settings-section">
          <div className="settings-section-title">{t("settings.sections.appearance")}</div>
          <div className="settings-field">
            <label className="settings-field-label">{t("settings.theme.label")}</label>
            <div className="settings-theme-options">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`settings-theme-option ${theme === opt.value ? "active" : ""}`}
                  onClick={() => setTheme(opt.value)}
                >
                  {opt.value === "system"
                    ? t("settings.theme.system")
                    : opt.value === "light"
                      ? t("settings.theme.light")
                      : t("settings.theme.dark")}
                </button>
              ))}
            </div>
            <div className="settings-field-hint">{t("settings.appearanceHint")}</div>
          </div>
          <div className="settings-field">
            <label className="settings-field-label">{t("settings.language.label")}</label>
            <LanguageSelect locale={locale} onSelect={setLocale} />
            <div className="settings-field-hint">{t("settings.language.hint")}</div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">
            {t("settings.networkSection")}
            {networkSaved ? (
              <span className="settings-saved" style={{ marginLeft: 8 }}>
                {t("settings.saved")}
              </span>
            ) : null}
          </div>
          <div className="settings-field">
            <label className="settings-field-label">
              {t("settings.forceIpv4")}
              <label className="tools-toggle" style={{ marginLeft: 12, verticalAlign: "middle" }}>
                <input
                  type="checkbox"
                  checked={forceIpv4}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setForceIpv4(val);
                    await window.hermesAPI.setConfig(
                      "network.force_ipv4",
                      val ? "true" : "false",
                      activeProfile,
                    );
                    setNetworkSaved(true);
                    setTimeout(() => setNetworkSaved(false), 2000);
                  }}
                />
                <span className="tools-toggle-track" />
              </label>
            </label>
            <div className="settings-field-hint">{t("settings.forceIpv4Hint")}</div>
          </div>
          <div className="settings-field">
            <label className="settings-field-label">{t("settings.httpProxy")}</label>
            <input
              className="input"
              type="text"
              value={httpProxy}
              onChange={(e) => setHttpProxy(e.target.value)}
              onBlur={async () => {
                await window.hermesAPI.setConfig("network.proxy", httpProxy.trim(), activeProfile);
                setNetworkSaved(true);
                setTimeout(() => setNetworkSaved(false), 2000);
              }}
              placeholder={t("settings.proxyPlaceholder")}
            />
            <div className="settings-field-hint">{t("settings.httpProxyHint")}</div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">{t("settings.dataSection")}</div>
          <div className="settings-field">
            <div className="settings-field-hint" style={{ marginBottom: 10 }}>
              {t("settings.dataHint")}
            </div>
            <div className="settings-hermes-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleBackup()}
                disabled={backingUp}
              >
                <Download size={14} style={{ marginRight: 6 }} />
                {backingUp ? t("settings.backingUp") : t("settings.exportBackup")}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleImport()}
                disabled={importing}
              >
                <Upload size={14} style={{ marginRight: 6 }} />
                {importing ? t("settings.importing") : t("settings.importBackup")}
              </button>
            </div>
            {backupResult ? (
              <div
                className={`settings-hermes-result ${backupResult.includes("created") || backupResult.includes("success") ? "success" : "error"}`}
                style={{ marginTop: 8 }}
              >
                {backupResult}
              </div>
            ) : null}
            {importResult ? (
              <div
                className={`settings-hermes-result ${importResult.includes("complete") ? "success" : "error"}`}
                style={{ marginTop: 8 }}
              >
                {importResult}
              </div>
            ) : null}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">
            <button
              type="button"
              className="settings-drawer-link-btn"
              style={{ fontSize: "inherit", fontWeight: "inherit" }}
              onClick={() => {
                const next = !logsExpanded;
                setLogsExpanded(next);
                if (next) void loadLogs();
              }}
            >
              <FileText size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              {t("settings.logsSection")} {logsExpanded ? "▾" : "▸"}
            </button>
          </div>
          {logsExpanded ? (
            <div className="settings-field">
              <div className="workspaces-settings-log-actions">
                {["gateway.log", "agent.log", "errors.log"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`btn btn-sm ${logFile === f ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      setLogFile(f);
                      void window.hermesAPI.readLogs(f, 300).then((r) => {
                        setLogContent(r.content);
                        setLogPath(r.path);
                      });
                    }}
                  >
                    {f.replace(".log", "")}
                  </button>
                ))}
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => void loadLogs()}>
                  {t("settings.refresh")}
                </button>
              </div>
              {logPath ? (
                <div className="settings-field-hint" style={{ marginBottom: 4 }}>
                  {logPath}
                </div>
              ) : null}
              <pre
                className="settings-hermes-doctor"
                style={{
                  maxHeight: 300,
                  overflow: "auto",
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {logContent || t("settings.emptyLog")}
              </pre>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
