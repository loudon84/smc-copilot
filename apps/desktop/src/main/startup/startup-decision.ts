import { getConnectionConfig, getFullConnectionConfig } from "../config";
import { readAuthEndpointConfig } from "../auth/auth-endpoint-config-store";
import { hydrateTokenStore, readStoredSession } from "../auth/token-store";
import { resolveRuntimeState } from "../enterprise/runtime-state-resolver";
import { testRemoteConnection } from "../hermes";
import { isSshTunnelHealthy, startSshTunnel } from "../ssh-tunnel";
import { readBootstrapState } from "../user-config/user-config-store";
import type {
  StartupDecision,
  StartupScreen,
  StartupDecisionReason,
  ConnectionMode,
} from "../../shared/startup/startup-contract";

function authRequiredDecision(connectionMode: ConnectionMode): StartupDecision {
  return {
    runtime: null,
    connectionMode,
    nextScreen: "login",
    skipAgentInstall: true,
    skipModelSetup: true,
    shouldVerifyInBackground: false,
    reason: "auth-required",
  };
}

function bootstrapPendingDecision(connectionMode: ConnectionMode): StartupDecision {
  return {
    runtime: null,
    connectionMode,
    nextScreen: "login",
    skipAgentInstall: true,
    skipModelSetup: true,
    shouldVerifyInBackground: false,
    reason: "bootstrap-pending",
  };
}

/**
 * 解析启动决策
 *
 * V3.3.1 规则（所有连接模式统一）：
 * 1. endpoint + auth token 必须就绪，否则 → login
 * 2. bootstrap 必须 initialized，否则 → login（bootstrap-pending）
 * 3. 按 connection mode 分支：
 *    - remote/ssh → 连接检测 → main / welcome
 *    - local → runtimeReady + modelConfigured → main
 *    - local → runtimeReady + !modelConfigured → setup
 *    - local → !runtimeReady → welcome
 */
// @lat: [[domain/auth#Startup gate]]
export async function resolveStartupDecision(): Promise<StartupDecision> {
  const conn = getConnectionConfig();
  const connectionMode: ConnectionMode = conn.mode === "remote" || conn.mode === "ssh"
    ? conn.mode
    : "local";

  // V3.3.1: auth + bootstrap gate for all modes
  await hydrateTokenStore();
  const endpointConfig = readAuthEndpointConfig();
  const session = await readStoredSession();
  if (!endpointConfig || !session?.accessToken) {
    return authRequiredDecision(connectionMode);
  }

  const bootstrap = readBootstrapState();
  if (!bootstrap.initialized) {
    return bootstrapPendingDecision(connectionMode);
  }

  // Remote mode
  if (conn.mode === "remote" && conn.remoteUrl) {
    const ok = await testRemoteConnection(
      conn.remoteUrl,
      getFullConnectionConfig().apiKey,
    );
    const nextScreen: StartupScreen = ok ? "main" : "welcome";
    const reason: StartupDecisionReason = ok
      ? "remote-ready"
      : "remote-unreachable";

    return {
      runtime: null,
      connectionMode: "remote",
      nextScreen,
      skipAgentInstall: true,
      skipModelSetup: true,
      shouldVerifyInBackground: false,
      reason,
      error: ok ? undefined : `Cannot reach remote Hermes at ${conn.remoteUrl}`,
    };
  }

  // SSH mode
  if (conn.mode === "ssh" && conn.ssh && conn.ssh.host) {
    try {
      await startSshTunnel(conn.ssh);
      const healthy = await isSshTunnelHealthy();

      if (healthy) {
        return {
          runtime: null,
          connectionMode: "ssh",
          nextScreen: "main",
          skipAgentInstall: true,
          skipModelSetup: true,
          shouldVerifyInBackground: false,
          reason: "ssh-ready",
        };
      }

      return {
        runtime: null,
        connectionMode: "ssh",
        nextScreen: "welcome",
        skipAgentInstall: true,
        skipModelSetup: true,
        shouldVerifyInBackground: false,
        reason: "ssh-unreachable",
        error: "SSH tunnel health check failed",
      };
    } catch (err) {
      return {
        runtime: null,
        connectionMode: "ssh",
        nextScreen: "welcome",
        skipAgentInstall: true,
        skipModelSetup: true,
        shouldVerifyInBackground: false,
        reason: "ssh-unreachable",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Local mode
  const runtime = resolveRuntimeState();

  if (runtime.runtimeReady && runtime.modelConfigured) {
    return {
      runtime,
      connectionMode: "local",
      nextScreen: "main",
      skipAgentInstall: true,
      skipModelSetup: true,
      shouldVerifyInBackground: true,
      reason: "runtime-ready-model-configured",
    };
  }

  if (runtime.runtimeReady && !runtime.modelConfigured) {
    return {
      runtime,
      connectionMode: "local",
      nextScreen: "setup",
      skipAgentInstall: true,
      skipModelSetup: false,
      shouldVerifyInBackground: true,
      reason: "runtime-ready-model-missing",
    };
  }

  return {
    runtime,
    connectionMode: "local",
    nextScreen: "welcome",
    skipAgentInstall: false,
    skipModelSetup: false,
    shouldVerifyInBackground: false,
    reason: "runtime-missing",
  };
}
