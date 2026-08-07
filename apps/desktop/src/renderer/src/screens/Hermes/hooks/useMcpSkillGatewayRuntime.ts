import { useCallback, useEffect, useRef, useState } from "react";
import type {
  McpGatewayDiagnosticsResult,
  McpGatewayInvokeTestInput,
  McpGatewayInvokeTestResult,
  McpGatewayProxyLogEntry,
  McpGatewayToolPreview,
  McpSkillGatewayProfileRegistration,
  McpSkillGatewayRuntimeConfig,
  McpSkillGatewayRuntimeStatus,
} from "../../../../../shared/mcp-skill-gateway-runtime/mcp-skill-gateway-runtime-contract";
import type {
  HermesClientAgent,
  HermesClientBootstrap,
  HermesClientTool,
  HermesReadinessCheckResult,
  HermesTaskResult,
  RecentHermesTask,
  TaskEventsTokenResult,
} from "../../../../../shared/hermes-client/hermes-client-contract";

export function useMcpSkillGatewayRuntime() {
  const [status, setStatus] = useState<McpSkillGatewayRuntimeStatus | null>(null);
  const [config, setConfig] = useState<McpSkillGatewayRuntimeConfig | null>(null);
  const [registrations, setRegistrations] = useState<McpSkillGatewayProfileRegistration[]>([]);
  const [logs, setLogs] = useState("");
  const [structuredLogs, setStructuredLogs] = useState<McpGatewayProxyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState<McpGatewayDiagnosticsResult | null>(
    null,
  );
  const [remoteTools, setRemoteTools] = useState<McpGatewayToolPreview[]>([]);
  const [clientTools, setClientTools] = useState<HermesClientTool[]>([]);
  const [clientAgents, setClientAgents] = useState<HermesClientAgent[]>([]);
  const [bootstrap, setBootstrap] = useState<HermesClientBootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [readinessResult, setReadinessResult] = useState<HermesReadinessCheckResult | null>(null);
  const [recentTasks, setRecentTasks] = useState<RecentHermesTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState<HermesTaskResult | null>(null);
  const [taskEvents, setTaskEvents] = useState<Array<Record<string, unknown>>>([]);
  const [taskEventsError, setTaskEventsError] = useState<string | null>(null);
  const [invokeResult, setInvokeResult] = useState<McpGatewayInvokeTestResult | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [clientLoading, setClientLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadStructuredLogs = useCallback(async (lines = 120) => {
    setLogsLoading(true);
    try {
      const entries = await window.mcpSkillGatewayRuntime.readStructuredLogs(lines);
      setStructuredLogs(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const loadRecentTasks = useCallback(async () => {
    const tasks = await window.mcpSkillGatewayRuntime.getRecentHermesTasks();
    setRecentTasks(tasks);
  }, []);

  const refreshClientContract = useCallback(async (enableBootstrap = true) => {
    if (!enableBootstrap) return;
    setClientLoading(true);
    setBootstrapError(null);
    try {
      const [bootstrapRes, agentsRes, tasks] = await Promise.all([
        window.mcpSkillGatewayRuntime.getHermesClientBootstrap({ profileName: "default" }),
        window.mcpSkillGatewayRuntime.listHermesClientAgents({ profileName: "default" }),
        window.mcpSkillGatewayRuntime.getRecentHermesTasks(),
      ]);
      if (bootstrapRes.ok && bootstrapRes.data) {
        setBootstrap(bootstrapRes.data);
      } else {
        setBootstrap(null);
        setBootstrapError(bootstrapRes.error ?? "Bootstrap failed");
      }
      if (agentsRes.ok && agentsRes.data) {
        setClientAgents(agentsRes.data);
      } else {
        setClientAgents([]);
      }
      setRecentTasks(tasks);
    } catch (err) {
      setBootstrapError(err instanceof Error ? err.message : String(err));
    } finally {
      setClientLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextConfig, nextRegs, nextLogs, nextStructured] = await Promise.all([
        window.mcpSkillGatewayRuntime.getStatus(),
        window.mcpSkillGatewayRuntime.getConfig(),
        window.mcpSkillGatewayRuntime.listProfileRegistrations(),
        window.mcpSkillGatewayRuntime.readProxyLogs(120),
        window.mcpSkillGatewayRuntime.readStructuredLogs(120),
      ]);
      setStatus(nextStatus);
      setConfig(nextConfig);
      setRegistrations(nextRegs);
      setLogs(nextLogs);
      setStructuredLogs(nextStructured);
      if (nextConfig.enableHermesClientBootstrap !== false) {
        await refreshClientContract(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshClientContract]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      setActionPending(true);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setActionPending(false);
      }
    },
    [refresh],
  );

  const saveConfig = useCallback(
    async (patch: Partial<McpSkillGatewayRuntimeConfig>) => {
      await runAction(async () => {
        const saved = await window.mcpSkillGatewayRuntime.saveConfig(patch);
        setConfig(saved);
      });
    },
    [runAction],
  );

  const runDiagnostics = useCallback(async () => {
    setActionPending(true);
    setError(null);
    try {
      const result = await window.mcpSkillGatewayRuntime.runDiagnostics();
      setDiagnosticsResult(result);
      setRemoteTools(result.tools);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(false);
    }
  }, [refresh]);

  const copyDiagnosticsReport = useCallback(async () => {
    if (!diagnosticsResult) return false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnosticsResult, null, 2));
      return true;
    } catch {
      return false;
    }
  }, [diagnosticsResult]);

  const listRemoteTools = useCallback(async (forceRefresh = false) => {
    setToolsLoading(true);
    setError(null);
    try {
      const tools = await window.mcpSkillGatewayRuntime.listRemoteTools(forceRefresh);
      setRemoteTools(tools);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToolsLoading(false);
    }
  }, []);

  const listClientTools = useCallback(
    async (input?: {
      agentAlias?: string;
      profileName?: string;
      workspaceId?: string;
      keyword?: string;
    }) => {
      setToolsLoading(true);
      setError(null);
      try {
        const result = await window.mcpSkillGatewayRuntime.listHermesClientTools(input);
        if (result.ok && result.data) {
          setClientTools(result.data);
        } else {
          setClientTools([]);
          setError(result.error ?? "Failed to load client tools");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setToolsLoading(false);
      }
    },
    [],
  );

  const runReadinessCheck = useCallback(
    async (input: {
      agentAlias: string;
      toolName?: string;
      profileName?: string;
      workspaceId?: string;
    }) => {
      setActionPending(true);
      setError(null);
      try {
        const result = await window.mcpSkillGatewayRuntime.runHermesReadinessCheck(input);
        if (result.ok && result.data) {
          setReadinessResult(result.data);
        } else {
          setReadinessResult(null);
          setError(result.error ?? "Readiness check failed");
        }
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setActionPending(false);
      }
    },
    [],
  );

  const loadTaskResult = useCallback(async (taskId: string) => {
    setActionPending(true);
    setError(null);
    setSelectedTaskId(taskId);
    try {
      const result = await window.mcpSkillGatewayRuntime.getHermesTaskResult(taskId);
      if (result.ok && result.data) {
        setTaskResult(result.data);
      } else {
        setTaskResult(null);
        setError(result.error ?? "Failed to load task result");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(false);
    }
  }, []);

  const subscribeTaskEvents = useCallback(
    async (taskId: string) => {
      if (config?.enableSseTokenEventSource === false) return null;
      eventSourceRef.current?.close();
      setTaskEvents([]);
      setTaskEventsError(null);
      try {
        const tokenResult = await window.mcpSkillGatewayRuntime.createHermesTaskEventsToken(taskId);
        if (!tokenResult.ok || !tokenResult.data?.event_url) {
          setTaskEventsError(tokenResult.error ?? "Failed to create events token");
          return null;
        }
        const es = new EventSource(tokenResult.data.event_url);
        eventSourceRef.current = es;
        es.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data) as Record<string, unknown>;
            setTaskEvents((prev) => [...prev, parsed]);
          } catch {
            setTaskEvents((prev) => [...prev, { raw: event.data }]);
          }
        };
        es.onerror = () => {
          setTaskEventsError("Event stream error or expired");
          es.close();
        };
        return tokenResult.data as TaskEventsTokenResult;
      } catch (err) {
        setTaskEventsError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [config?.enableSseTokenEventSource],
  );

  const previewArtifact = useCallback(async (artifactId: string) => {
    return window.mcpSkillGatewayRuntime.previewHermesArtifact(artifactId);
  }, []);

  const downloadArtifact = useCallback(async (artifactId: string) => {
    return window.mcpSkillGatewayRuntime.downloadHermesArtifact(artifactId);
  }, []);

  const invokeRemoteTool = useCallback(
    async (input: McpGatewayInvokeTestInput) => {
      setActionPending(true);
      setError(null);
      try {
        const result = await window.mcpSkillGatewayRuntime.invokeRemoteTool(input);
        setInvokeResult(result);
        if (result.taskHints?.taskId) {
          setSelectedTaskId(result.taskHints.taskId);
          await loadRecentTasks();
        }
        await loadStructuredLogs();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setActionPending(false);
      }
    },
    [loadRecentTasks, loadStructuredLogs],
  );

  return {
    status,
    config,
    registrations,
    logs,
    structuredLogs,
    loading,
    error,
    actionPending,
    diagnosticsResult,
    remoteTools,
    clientTools,
    clientAgents,
    bootstrap,
    bootstrapError,
    readinessResult,
    recentTasks,
    selectedTaskId,
    setSelectedTaskId,
    taskResult,
    taskEvents,
    taskEventsError,
    invokeResult,
    toolsLoading,
    clientLoading,
    logsLoading,
    refresh,
    refreshClientContract,
    saveConfig,
    runDiagnostics,
    copyDiagnosticsReport,
    listRemoteTools,
    listClientTools,
    runReadinessCheck,
    loadTaskResult,
    subscribeTaskEvents,
    previewArtifact,
    downloadArtifact,
    loadRecentTasks,
    loadStructuredLogs,
    invokeRemoteTool,
    startProxy: () => runAction(() => window.mcpSkillGatewayRuntime.startProxy()),
    stopProxy: () => runAction(() => window.mcpSkillGatewayRuntime.stopProxy()),
    restartProxy: () => runAction(() => window.mcpSkillGatewayRuntime.restartProxy()),
    testProxy: () => runAction(() => window.mcpSkillGatewayRuntime.testProxy()),
    testRemoteMcp: () => runAction(() => window.mcpSkillGatewayRuntime.testRemoteMcp()),
    registerProfile: (profile: string) =>
      runAction(() => window.mcpSkillGatewayRuntime.registerToProfile(profile)),
    unregisterProfile: (profile: string) =>
      runAction(() => window.mcpSkillGatewayRuntime.unregisterFromProfile(profile)),
  };
}
