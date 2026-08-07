import type { BrowserWindow } from "electron";
import { ipcMain, shell } from "electron";
import { join } from "node:path";
import { readInstallerPrecheck } from "./installer-precheck-reader";

import type {
  LoadConfigResult,
  PreflightReport,
  InstallMarker,
  DoctorReport,
  InstallProgressEvent,
  ValidationResult,
} from "../../shared/enterprise/enterprise-schema";

import type {
  EnterpriseInstallInput,
  EnterpriseInstallResult,
  EnterpriseUpdateInput,
  EnterpriseUpdateResult,
  EnterpriseRepairInput,
  EnterpriseRepairResult,
  EnterpriseRollbackInput,
  EnterpriseRollbackResult,
  InstallerPrecheck,
} from "../../shared/enterprise/enterprise-contract";

import type { InstallPhase } from "../../shared/enterprise/enterprise-constants";

import { loadDeploymentConfig } from "./deployment-config";
import { validateDeploymentConfig } from "./deployment-schema";
import { runPreflight } from "./preflight-checker";
import { resolveRuntimeBundle } from "./runtime-bundle-manager";
import { installHermesAgentSource } from "./hermes-agent-source-installer";
import { createOrReuseSharedVenv, installPythonDependencies } from "./python-venv-installer";
import { provisionDefaultHermesHome } from "./enterprise-config-provisioner";
import { bootstrapProfiles } from "./profile-runtime-bootstrapper";
import { installBundledSkills, applyPolicyReadOnly } from "./profile-policy-installer";
import { acquireInstallLock } from "./install-lock";
import { writeInstallMarker, readInstallMarker, existsInstallMarker } from "./install-marker";
import { createInstallLogger, readLatestInstallLog } from "./install-log";
import { runAllChecks, exportDoctorReport } from "./doctor/runtime-doctor";
import { ensureShims } from "./shim-manager";
import {
  mergeRuntimeConfig,
  createDefaultRuntimeConfig,
} from "./desktop-runtime-config";
import { resolveRuntimeState } from "./runtime-state-resolver";
import { resolveInstallLocation } from "./windows/install-location-resolver";
import { getMigrationStatus } from "../migrations/migration-runner";
import {
  requestEnterpriseInstallCancel,
  resetEnterpriseInstallCancel,
  throwIfInstallCancelled,
} from "./install-cancel";

export {
  requestEnterpriseInstallCancel,
  resetEnterpriseInstallCancel,
  isEnterpriseInstallCancelled,
} from "./install-cancel";

type ProgressCallback = (event: InstallProgressEvent) => void;

function makeProgress(stage: InstallProgressEvent["stage"], status: InstallProgressEvent["status"], progress: number, message: string, errorCode?: InstallProgressEvent["errorCode"]): InstallProgressEvent {
  return { stage, status, progress, message, errorCode, timestamp: new Date().toISOString() };
}

export async function executeEnterpriseInstallPipeline(
  mainWindow: BrowserWindow | null,
  input?: EnterpriseInstallInput,
): Promise<EnterpriseInstallResult> {
  const onProgress: ProgressCallback = (event) => {
    mainWindow?.webContents?.send("enterprise-install:progress", event);
  };

  const logger = createInstallLogger();
  resetEnterpriseInstallCancel();

  try {
    const runtimeState = resolveRuntimeState();
    if (!input?.force && runtimeState.runtimeReady) {
      ensureShims();
      mergeRuntimeConfig(createDefaultRuntimeConfig());
      const marker = readInstallMarker();
      onProgress(
        makeProgress("check-enterprise-install", "completed", 100, "运行时已就绪，跳过安装"),
      );
      return { ok: true, marker: marker || undefined };
    }

    onProgress(makeProgress("check-enterprise-install", "running", 0, "检查安装状态..."));
    logger.info("check-enterprise-install", "开始企业安装");
    throwIfInstallCancelled();

    onProgress(makeProgress("load-deployment-config", "running", 5, "加载配置..."));
    throwIfInstallCancelled();
    const configResult = loadDeploymentConfig();
    if (!configResult.ok || !configResult.config) {
      onProgress(makeProgress("load-deployment-config", "failed", 5, "配置加载失败", "E_DEPLOY_SCHEMA_INVALID"));
      return { ok: false, errorCode: "E_DEPLOY_SCHEMA_INVALID", message: configResult.error?.message };
    }
    const config = configResult.config;
    onProgress(makeProgress("load-deployment-config", "completed", 8, "配置加载完成"));

    onProgress(makeProgress("acquire-install-lock", "running", 9, "获取安装锁..."));
    const lock = acquireInstallLock();
    if (!lock.acquired) {
      onProgress(makeProgress("acquire-install-lock", "failed", 9, "安装锁获取超时", "E_INSTALL_LOCK_TIMEOUT"));
      return { ok: false, errorCode: "E_INSTALL_LOCK_TIMEOUT", message: "另一个安装进程正在运行" };
    }
    onProgress(makeProgress("acquire-install-lock", "completed", 10, "安装锁已获取"));
    throwIfInstallCancelled();

    if (!input?.skipPreflight) {
      onProgress(makeProgress("run-preflight", "running", 10, "运行预检..."));
      const preflightReport = await runPreflight(config);
      if (!preflightReport.p0Passed) {
        lock.release();
        onProgress(makeProgress("run-preflight", "failed", 15, "预检未通过"));
        return { ok: false, errorCode: "E_DEPLOY_SCHEMA_INVALID", message: "P0 预检失败" };
      }
      onProgress(makeProgress("run-preflight", "completed", 15, "预检通过"));
    }

    onProgress(makeProgress("resolve-runtime-bundle", "running", 15, "准备 Runtime Bundle..."));
    throwIfInstallCancelled();
    const bundleResult = await resolveRuntimeBundle(config, (p) => {
      onProgress(makeProgress("resolve-runtime-bundle", "running", 15 + p.percent * 0.15, p.message));
    });
    if (!bundleResult.ok) {
      lock.release();
      onProgress(makeProgress("resolve-runtime-bundle", "failed", 30, bundleResult.message || "Bundle 准备失败", bundleResult.errorCode as any));
      return { ok: false, errorCode: bundleResult.errorCode as any, message: bundleResult.message };
    }
    onProgress(makeProgress("resolve-runtime-bundle", "completed", 30, "Bundle 准备完成"));

    onProgress(makeProgress("install-hermes-agent-source", "running", 40, "安装 Hermes Agent..."));
    throwIfInstallCancelled();
    const agentResult = await installHermesAgentSource(config, bundleResult.runtimePath!, (p) => {
      onProgress(makeProgress("install-hermes-agent-source", "running", 40, p.message));
    });
    if (!agentResult.ok) {
      lock.release();
      onProgress(makeProgress("install-hermes-agent-source", "failed", 50, agentResult.message || "Agent 安装失败", agentResult.errorCode as any));
      return { ok: false, errorCode: agentResult.errorCode as any, message: agentResult.message };
    }
    onProgress(makeProgress("install-hermes-agent-source", "completed", 50, "Agent 安装完成"));

    onProgress(makeProgress("create-or-reuse-shared-venv", "running", 55, "创建 Python venv..."));
    const venvResult = createOrReuseSharedVenv(config);
    if (!venvResult.ok) {
      lock.release();
      onProgress(makeProgress("create-or-reuse-shared-venv", "failed", 58, venvResult.message || "venv 创建失败", venvResult.errorCode as any));
      return { ok: false, errorCode: venvResult.errorCode as any, message: venvResult.message };
    }
    onProgress(makeProgress("create-or-reuse-shared-venv", "completed", 58, "venv 就绪"));

    onProgress(makeProgress("install-python-dependencies", "running", 60, "安装 Python 依赖..."));
    const pipResult = installPythonDependencies(config, venvResult.venvPath!, agentResult.agentPath!, (p) => {
      onProgress(makeProgress("install-python-dependencies", "running", 60, p.message));
    });
    if (!pipResult.ok) {
      lock.release();
      onProgress(makeProgress("install-python-dependencies", "failed", 75, pipResult.message || "依赖安装失败", pipResult.errorCode as any));
      return { ok: false, errorCode: pipResult.errorCode as any, message: pipResult.message };
    }
    onProgress(makeProgress("install-python-dependencies", "completed", 75, "依赖安装完成"));

    onProgress(makeProgress("provision-default-hermes-home", "running", 77, "初始化 ~/.hermes..."));
    const provisionResult = provisionDefaultHermesHome(config, agentResult.agentPath!, venvResult.venvPath!);
    if (!provisionResult.ok) {
      lock.release();
      return { ok: false, message: provisionResult.message };
    }
    onProgress(makeProgress("provision-default-hermes-home", "completed", 78, "~/.hermes 初始化完成"));

    onProgress(makeProgress("bootstrap-profiles", "running", 80, "引导 Profile..."));
    const profileResult = bootstrapProfiles(config, agentResult.agentPath!, venvResult.venvPath!, (p) => {
      onProgress(makeProgress("bootstrap-profiles", "running", 80, p.message));
    });
    if (!profileResult.ok) {
      lock.release();
      return { ok: false, errorCode: profileResult.errorCode as any, message: profileResult.message };
    }
    onProgress(makeProgress("bootstrap-profiles", "completed", 88, "Profile 引导完成"));

    onProgress(makeProgress("install-bundled-skills", "running", 89, "安装 Skills..."));
    for (const profile of profileResult.profiles || []) {
      installBundledSkills(config, profile.name, profile.home, bundleResult.runtimePath!);
      applyPolicyReadOnly(profile.name);
    }
    onProgress(makeProgress("install-bundled-skills", "completed", 91, "Skills 安装完成"));

    onProgress(makeProgress("apply-policy", "running", 92, "应用 Policy..."));
    onProgress(makeProgress("apply-policy", "completed", 93, "Policy 已应用"));

    onProgress(makeProgress("write-install-marker", "running", 95, "写入安装标记..."));
    const marker: InstallMarker = {
      schemaVersion: "1.2.1",
      installedAt: new Date().toISOString(),
      desktopVersion: require("electron").app.getVersion(),
      agentVersion: agentResult.version || "unknown",
      bundleSha256: config.runtimeBundle.bundleSha256 || "",
      installPath: bundleResult.runtimePath || "",
      hermesHomePath: provisionResult.hermesHome || "",
      profiles: (profileResult.profiles || []).map((p) => p.name as any),
      deploymentConfigHash: "",
      doctorResult: null,
      rollbackSnapshots: [],
    };
    writeInstallMarker(marker);
    onProgress(makeProgress("write-install-marker", "completed", 97, "安装标记已写入"));

    onProgress(makeProgress("open-workspaces", "completed", 100, "安装完成"));
    lock.release();
    logger.info("open-workspaces", "企业安装完成");

    return { ok: true, marker };
  } catch (err) {
    if (err instanceof Error && err.message === "INSTALL_CANCELLED") {
      logger.warn("check-enterprise-install", "安装已取消");
      return { ok: false, errorCode: "E_INSTALL_CANCELLED", message: "安装已取消" };
    }
    logger.error("check-enterprise-install", `安装异常: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, message: `安装失败: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    logger.close();
  }
}

export function setupEnterpriseInstallIpcEarly(): void {
  ipcMain.handle("enterprise:get-deployment-config", async (): Promise<LoadConfigResult> => {
    return loadDeploymentConfig();
  });

  ipcMain.handle("enterprise:validate-deployment-config", async (): Promise<ValidationResult> => {
    const configResult = loadDeploymentConfig();
    if (!configResult.ok || !configResult.config) {
      return { ok: false, errors: configResult.error?.fields || [] };
    }
    const validation = validateDeploymentConfig(configResult.config);
    return validation;
  });

  ipcMain.handle("enterprise:preflight", async (): Promise<PreflightReport> => {
    const configResult = loadDeploymentConfig();
    if (!configResult.ok || !configResult.config) {
      return { checks: [], p0Passed: false, p1Warnings: 0, p2Infos: 0, totalDurationMs: 0 };
    }
    return runPreflight(configResult.config);
  });

  ipcMain.handle("enterprise:install-cancel", async (): Promise<{ ok: boolean }> => {
    requestEnterpriseInstallCancel();
    return { ok: true };
  });

  ipcMain.handle("enterprise:update", async (_event, _input?: EnterpriseUpdateInput): Promise<EnterpriseUpdateResult> => {
    const configResult = loadDeploymentConfig();
    if (!configResult.ok || !configResult.config) {
      return { ok: false, message: configResult.error?.message || "配置加载失败" };
    }
    const config = configResult.config;
    ensureShims();
    const venvResult = createOrReuseSharedVenv(config);
    if (!venvResult.ok) {
      return { ok: false, message: venvResult.message, errorCode: venvResult.errorCode };
    }
    const agentPath = resolveInstallLocation().agentDir;
    const pipResult = installPythonDependencies(config, venvResult.venvPath!, agentPath);
    if (!pipResult.ok) {
      return { ok: false, message: pipResult.message, errorCode: pipResult.errorCode };
    }
    ensureShims();
    return { ok: true, message: "运行时组件已更新" };
  });

  ipcMain.handle("enterprise:repair", async (_event, input?: EnterpriseRepairInput): Promise<EnterpriseRepairResult> => {
    const level = input?.level ?? 1;
    const configResult = loadDeploymentConfig();
    if (!configResult.ok || !configResult.config) {
      return { ok: false, level, message: configResult.error?.message || "配置加载失败" };
    }
    const config = configResult.config;
    const marker = readInstallMarker();

    try {
      ensureShims();
      if (level >= 1) {
        const venvResult = createOrReuseSharedVenv(config);
        if (!venvResult.ok) {
          return { ok: false, level, message: venvResult.message, errorCode: venvResult.errorCode };
        }
        const agentPath = resolveInstallLocation().agentDir;
        const pipResult = installPythonDependencies(config, venvResult.venvPath!, agentPath);
        if (!pipResult.ok) {
          return { ok: false, level, message: pipResult.message, errorCode: pipResult.errorCode };
        }
      }
      if (level >= 2) {
        const bundleResult = await resolveRuntimeBundle(config);
        if (bundleResult.ok && bundleResult.runtimePath) {
          await installHermesAgentSource(config, bundleResult.runtimePath);
        }
      }
      ensureShims();
      const doctorReport = await runAllChecks({ config, marker });
      const ok =
        doctorReport.overallStatus === "pass" || doctorReport.overallStatus === "warn";
      return { ok, level, doctorReport, message: ok ? "修复完成" : "仍有问题，请查看诊断报告" };
    } catch (err) {
      return {
        ok: false,
        level,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("enterprise:rollback", async (_event, _input: EnterpriseRollbackInput): Promise<EnterpriseRollbackResult> => {
    const marker = readInstallMarker();
    ensureShims();
    return {
      ok: false,
      message: marker?.rollbackSnapshots?.length
        ? "完整回滚尚未实现；已刷新 CLI shim，请查看 install-marker 中的快照信息"
        : "无可用回滚快照；已刷新 CLI shim",
    };
  });

  ipcMain.handle("enterprise:get-install-marker", async (): Promise<InstallMarker | null> => {
    return readInstallMarker();
  });

  ipcMain.handle("enterprise:get-install-log", async (_event, _input: { type: InstallPhase }): Promise<string> => {
    return readLatestInstallLog();
  });

  ipcMain.handle("enterprise:open-log-dir", async (): Promise<{ ok: boolean }> => {
    const logDir = join(resolveInstallLocation().runtimeRoot, "logs");
    const result = await shell.openPath(logDir);
    return { ok: result === "" };
  });

  ipcMain.handle("enterprise:run-doctor", async (): Promise<DoctorReport> => {
    const configResult = loadDeploymentConfig();
    if (!configResult.ok || !configResult.config) {
      return {
        id: "",
        checks: [],
        overallStatus: "error",
        createdAt: new Date().toISOString(),
        totalDurationMs: 0,
      };
    }
    const marker = readInstallMarker();
    return runAllChecks({ config: configResult.config, marker });
  });

  ipcMain.handle("enterprise:export-doctor-report", async (): Promise<{ ok: boolean; path: string }> => {
    const configResult = loadDeploymentConfig();
    if (!configResult.ok || !configResult.config) {
      return { ok: false, path: "" };
    }
    const marker = readInstallMarker();
    const report = await runAllChecks({ config: configResult.config, marker });
    return exportDoctorReport(report);
  });

  ipcMain.handle("enterprise:get-migration-status", async () => {
    return getMigrationStatus();
  });

  ipcMain.handle("enterprise:get-runtime-state", async () => {
    return resolveRuntimeState();
  });

  ipcMain.handle(
    "enterprise:get-installer-precheck",
    async (): Promise<InstallerPrecheck | null> => {
      return readInstallerPrecheck();
    },
  );
}

export function setupEnterpriseInstallIPC(mainWindow: BrowserWindow): void {
  ipcMain.handle("enterprise:install", async (_event, input?: EnterpriseInstallInput): Promise<EnterpriseInstallResult> => {
    return executeEnterpriseInstallPipeline(mainWindow, input);
  });

  ipcMain.handle("enterprise:reinstall-runtime", async (): Promise<EnterpriseInstallResult> => {
    return executeEnterpriseInstallPipeline(mainWindow, { force: true, skipPreflight: true });
  });
}
