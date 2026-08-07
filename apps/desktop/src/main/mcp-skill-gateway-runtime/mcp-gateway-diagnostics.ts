import type {
  DiagnosticCheck,
  DiagnosticError,
  McpGatewayDiagnosticsResult,
  McpGatewayToolPreview,
} from "../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";
import { fetchMcpBackendDescriptor } from "./mcp-backend-descriptor";
import {
  getMcpSkillGatewayConfig,
  resolveBackendBaseUrl,
} from "./mcp-skill-gateway-config";
import type { McpDebugProbeResponse } from "./mcp-gateway-probe";
import {
  fetchMcpGatewayDebugProbe,
  isMcpDebugProbeConnected,
  readMcpDebugProbeError,
  readMcpDebugProbeToolCount,
  tryDirectRemoteMcpInitializeDebug,
} from "./mcp-gateway-probe";
import {
  isMcpSkillGatewayProxyRunning,
  startMcpSkillGatewayProxy,
} from "./mcp-skill-gateway-proxy";
import {
  listMcpSkillGatewayProfileRegistrations,
  registerMcpSkillGatewayToHermes,
} from "./mcp-skill-gateway-register";
import { getMcpAuthState } from "./mcp-token-provider";
import { isGatewayRunning } from "../hermes";
import {
  getHermesClientBootstrap,
  listHermesClientAgents,
  listHermesClientTools,
  runHermesReadinessCheck,
} from "./hermes-client-api";

function step(
  stepId: string,
  label: string,
  ok: boolean,
  detail?: string,
  error?: string,
  errorCode?: DiagnosticCheck["errorCode"],
): DiagnosticCheck {
  return { step: stepId, label, ok, detail, error, errorCode };
}

function buildErrorsFromSteps(steps: DiagnosticCheck[]): DiagnosticError[] {
  return steps
    .filter((row) => !row.ok)
    .map((row) => ({
      step: row.step,
      code: row.errorCode ?? "MCP_OP_REMOTE_INITIALIZE_FAILED",
      message: row.error ?? "Check failed",
    }));
}

function readProbeTools(probe: McpDebugProbeResponse | null): McpGatewayToolPreview[] {
  return Array.isArray(probe?.tools) ? probe.tools : [];
}

export async function runMcpSkillGatewayDiagnostics(): Promise<McpGatewayDiagnosticsResult> {
  const checkedAt = new Date().toISOString();
  const config = getMcpSkillGatewayConfig();

  const authState = getMcpAuthState();
  const auth = step(
    "auth",
    "Desktop login",
    authState.tokenPresent,
    authState.tokenPresent ? "Token present" : undefined,
    authState.tokenPresent ? undefined : "Desktop login required",
    authState.tokenPresent ? undefined : "MCP_OP_AUTH_REQUIRED",
  );

  const descriptorResult = await fetchMcpBackendDescriptor(true);
  const backendBaseUrl = resolveBackendBaseUrl();
  const backend = step(
    "backend",
    "Backend & MCP descriptor",
    descriptorResult.ok && Boolean(backendBaseUrl),
    descriptorResult.ok
      ? descriptorResult.descriptor?.upstreamUrl
      : backendBaseUrl || undefined,
    descriptorResult.ok
      ? undefined
      : descriptorResult.error?.message ?? "Backend unreachable or descriptor missing",
    descriptorResult.ok
      ? undefined
      : descriptorResult.error?.code === "MCP_DESCRIPTOR_MISSING"
        ? "MCP_OP_DESCRIPTOR_MISSING"
        : "MCP_OP_BACKEND_UNREACHABLE",
  );

  let proxyRunning = isMcpSkillGatewayProxyRunning();
  let proxyStartError: string | undefined;
  if (!proxyRunning && auth.ok) {
    try {
      await startMcpSkillGatewayProxy(config.localProxyPort);
      proxyRunning = isMcpSkillGatewayProxyRunning();
    } catch (err) {
      proxyStartError = err instanceof Error ? err.message : String(err);
    }
  }

  const localProxy = step(
    "localProxy",
    "Local MCP proxy",
    proxyRunning,
    proxyRunning ? `127.0.0.1:${config.localProxyPort}` : undefined,
    proxyRunning ? undefined : proxyStartError ?? "Local MCP proxy is not running",
    proxyRunning ? undefined : "MCP_OP_PROXY_NOT_RUNNING",
  );

  let probe: McpDebugProbeResponse | null = null;
  if (proxyRunning && auth.ok) {
    try {
      probe = await fetchMcpGatewayDebugProbe();
    } catch (err) {
      probe = {
        ok: false,
        error: {
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  const probeConnected = isMcpDebugProbeConnected(probe);
  const probeToolCount = readMcpDebugProbeToolCount(probe);

  const remoteMcp = probeConnected
    ? step(
        "remoteMcp",
        "Remote MCP (initialize + tools/list)",
        true,
        `connected, ${probeToolCount} tools`,
      )
    : step(
        "remoteMcp",
        "Remote MCP (initialize + tools/list)",
        false,
        undefined,
        !proxyRunning
          ? "Local MCP proxy is not running"
          : !auth.ok
            ? "Desktop login required"
            : readMcpDebugProbeError(probe),
        "MCP_OP_REMOTE_INITIALIZE_FAILED",
      );

  const toolsList =
    probeConnected && probeToolCount > 0
      ? step(
          "toolsList",
          "MCP tools/list preview",
          true,
          `${probeToolCount} tools`,
        )
      : step(
          "toolsList",
          "MCP tools/list preview",
          false,
          undefined,
          probeConnected
            ? "tools/list failed or returned empty"
            : readMcpDebugProbeError(probe) ?? "tools/list failed or returned empty",
          "MCP_OP_TOOLS_LIST_FAILED",
        );

  let defaultProfileRegistered = false;
  let hermesRestartRequired = false;
  let registrationReady = false;

  if (auth.ok && proxyRunning) {
    const regResult = await registerMcpSkillGatewayToHermes({
      profile: "default",
      localProxyPort: config.localProxyPort,
      enabled: true,
    });
    defaultProfileRegistered = regResult.ok && Boolean(regResult.ready);
    hermesRestartRequired = Boolean(regResult.hermesRestartRequired);
    registrationReady = defaultProfileRegistered;
  }

  const registrations = listMcpSkillGatewayProfileRegistrations();
  const defaultReg = registrations.find((r) => r.profile === "default");
  if (defaultReg?.registered) {
    defaultProfileRegistered = true;
  }

  const defaultProfileRegistration = step(
    "defaultProfileRegistration",
    "Default profile MCP registration",
    registrationReady || Boolean(defaultReg?.ready),
    defaultReg?.url ?? undefined,
    registrationReady || defaultReg?.ready
      ? undefined
      : "Default profile not registered to local proxy",
    registrationReady || defaultReg?.ready
      ? undefined
      : "MCP_OP_PROFILE_NOT_REGISTERED",
  );

  const gatewayRunning = isGatewayRunning();
  const hermesGateway = step(
    "hermesGateway",
    "Hermes Gateway runtime",
    !hermesRestartRequired || !gatewayRunning,
    gatewayRunning
      ? hermesRestartRequired
        ? "Running — restart required"
        : "Running"
      : "Not running",
    hermesRestartRequired && gatewayRunning
      ? "Hermes Gateway restart required to load mcp_skill_gateway"
      : undefined,
    hermesRestartRequired && gatewayRunning
      ? "MCP_OP_HERMES_RESTART_REQUIRED"
      : undefined,
  );

  const steps = [
    auth,
    backend,
    localProxy,
    remoteMcp,
    toolsList,
    defaultProfileRegistration,
    hermesGateway,
  ];

  if (config.enableHermesClientBootstrap !== false && auth.ok) {
    const bootstrapResult = await getHermesClientBootstrap({ profileName: "default" });
    steps.push(
      step(
        "clientBootstrap",
        "Hermes Client bootstrap",
        bootstrapResult.ok,
        bootstrapResult.ok
          ? `${bootstrapResult.data?.user.display_name} @ ${bootstrapResult.data?.org.name}`
          : undefined,
        bootstrapResult.ok ? undefined : bootstrapResult.error ?? "Bootstrap failed",
        bootstrapResult.ok ? undefined : "HERMES_CLIENT_BOOTSTRAP_FAILED",
      ),
    );

    const agentsResult = await listHermesClientAgents({ profileName: "default" });
    const hasCommonWriter = Boolean(
      agentsResult.data?.some((a) => a.agent_alias === "common-writer"),
    );
    steps.push(
      step(
        "clientAgents",
        "Hermes Client agents",
        agentsResult.ok && (agentsResult.data?.length ?? 0) > 0,
        agentsResult.ok
          ? `${agentsResult.data?.length ?? 0} agents${hasCommonWriter ? ", common-writer" : ""}`
          : undefined,
        agentsResult.ok ? undefined : agentsResult.error ?? "Agents list failed",
        agentsResult.ok ? undefined : "HERMES_CLIENT_AGENT_ALIAS_NOT_FOUND",
      ),
    );

    const toolsResult = await listHermesClientTools({ agentAlias: "common-writer" });
    steps.push(
      step(
        "clientToolsFilter",
        "Agent alias tools filter",
        toolsResult.ok && (toolsResult.data?.length ?? 0) > 0,
        toolsResult.ok ? `${toolsResult.data?.length ?? 0} tools for common-writer` : undefined,
        toolsResult.ok ? undefined : toolsResult.error ?? "Client tools filter failed",
        toolsResult.ok ? undefined : "HERMES_CLIENT_TOOLS_LIST_FAILED",
      ),
    );

    const readinessResult = await runHermesReadinessCheck({ agentAlias: "common-writer" });
    steps.push(
      step(
        "clientReadiness",
        "Readiness check (common-writer)",
        readinessResult.ok && Boolean(readinessResult.data?.ready),
        readinessResult.ok
          ? readinessResult.data?.ready
            ? "ready"
            : readinessResult.data?.routing?.reason ?? "not ready"
          : undefined,
        readinessResult.ok
          ? readinessResult.data?.ready
            ? undefined
            : readinessResult.data?.errors?.[0]?.message ?? "Readiness check failed"
          : readinessResult.error ?? "Readiness check failed",
        readinessResult.ok ? undefined : "HERMES_CLIENT_READINESS_FAILED",
      ),
    );
  }

  const errors = buildErrorsFromSteps(steps);
  const ok = steps.every((row) => row.ok);

  const remoteInitialize = await tryDirectRemoteMcpInitializeDebug();

  return {
    ok,
    checkedAt,
    auth,
    backend,
    localProxy,
    remoteMcp,
    toolsList,
    defaultProfileRegistration,
    hermesGateway,
    toolCount: probeToolCount,
    tools: readProbeTools(probe),
    hermesRestartRequired: hermesRestartRequired && gatewayRunning,
    defaultProfileRegistered,
    errors,
    steps,
    hermesRegistration: defaultProfileRegistration,
    debugRaw: {
      probe,
      remoteInitialize,
    },
  };
}
