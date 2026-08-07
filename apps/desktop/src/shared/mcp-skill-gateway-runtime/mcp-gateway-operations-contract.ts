/** v6.6.1 + v6.7 — MCP Gateway operations (diagnostics, tools preview, invoke test, logs). */

import type { McpSkillGatewayDesktopErrorCode } from "./mcp-skill-gateway-runtime-contract";

/** v6.6.1 operations error codes (PRD §10). */
export type McpGatewayOperationsErrorCode =
  | "MCP_OP_AUTH_REQUIRED"
  | "MCP_OP_BACKEND_NOT_CONFIGURED"
  | "MCP_OP_BACKEND_UNREACHABLE"
  | "MCP_OP_DESCRIPTOR_MISSING"
  | "MCP_OP_PROXY_NOT_RUNNING"
  | "MCP_OP_PROXY_START_FAILED"
  | "MCP_OP_REMOTE_INITIALIZE_FAILED"
  | "MCP_OP_TOOLS_LIST_FAILED"
  | "MCP_OP_TOOL_NOT_FOUND"
  | "MCP_OP_TOOL_PERMISSION_DENIED"
  | "MCP_OP_TOOL_CALL_FAILED"
  | "MCP_OP_PROFILE_NOT_REGISTERED"
  | "MCP_OP_HERMES_RESTART_REQUIRED"
  | "MCP_OP_INVALID_JSON_ARGUMENTS"
  | "MCP_OP_TOOL_APPROVAL_REQUIRED"
  | "MCP_OP_TOOL_GRANT_REVOKED"
  | "MCP_OP_TOOL_GRANT_EXPIRED"
  | "MCP_OP_TOOL_CONSTRAINT_VIOLATION";

/** Map v6.6 MCP_DIAG_* codes to v6.6.1 MCP_OP_* for external surfaces. */
export const MCP_DIAG_TO_OP_ERROR: Record<string, McpGatewayOperationsErrorCode> = {
  MCP_DIAG_AUTH_REQUIRED: "MCP_OP_AUTH_REQUIRED",
  MCP_DIAG_BACKEND_UNREACHABLE: "MCP_OP_BACKEND_UNREACHABLE",
  MCP_DIAG_DESCRIPTOR_MISSING: "MCP_OP_DESCRIPTOR_MISSING",
  MCP_DIAG_PROXY_NOT_RUNNING: "MCP_OP_PROXY_NOT_RUNNING",
  MCP_DIAG_REMOTE_INITIALIZE_FAILED: "MCP_OP_REMOTE_INITIALIZE_FAILED",
  MCP_DIAG_TOOLS_LIST_FAILED: "MCP_OP_TOOLS_LIST_FAILED",
  MCP_DIAG_PROFILE_NOT_REGISTERED: "MCP_OP_PROFILE_NOT_REGISTERED",
  MCP_DIAG_HERMES_RESTART_REQUIRED: "MCP_OP_HERMES_RESTART_REQUIRED",
  MCP_DIAG_TOOL_CALL_FAILED: "MCP_OP_TOOL_CALL_FAILED",
  MCP_GATEWAY_NOT_LOGGED_IN: "MCP_OP_AUTH_REQUIRED",
  MCP_GATEWAY_BACKEND_NOT_CONFIGURED: "MCP_OP_BACKEND_NOT_CONFIGURED",
  MCP_GATEWAY_PROXY_NOT_RUNNING: "MCP_OP_PROXY_NOT_RUNNING",
  MCP_GATEWAY_PROXY_START_FAILED: "MCP_OP_PROXY_START_FAILED",
};

export function toOperationsErrorCode(
  code: string | undefined,
): McpGatewayOperationsErrorCode | undefined {
  if (!code) return undefined;
  if (code.startsWith("MCP_OP_")) {
    return code as McpGatewayOperationsErrorCode;
  }
  return MCP_DIAG_TO_OP_ERROR[code];
}

export type McpGatewayToolCategory = "hermes" | "genehub" | "system" | "unknown";
export type McpGatewayToolPermission = "read" | "write" | "admin";
export type McpGatewayRiskLevel = "low" | "medium" | "high";
export type McpGatewayApprovalMode = "none" | "server";
export type McpGatewayGrantStatus =
  | "active"
  | "missing"
  | "pending"
  | "revoked"
  | "expired"
  | "disabled";

export interface DiagnosticCheck {
  step: string;
  ok: boolean;
  label: string;
  detail?: string;
  error?: string;
  errorCode?:
    | McpGatewayOperationsErrorCode
    | McpSkillGatewayDesktopErrorCode
    | import("../hermes-client/hermes-client-errors").HermesClientErrorCode;
}

export interface DiagnosticError {
  step: string;
  code:
    | McpGatewayOperationsErrorCode
    | McpSkillGatewayDesktopErrorCode
    | import("../hermes-client/hermes-client-errors").HermesClientErrorCode;
  message: string;
}

export interface McpGatewayToolPreview {
  name: string;
  description: string;
  category: McpGatewayToolCategory;
  permission: McpGatewayToolPermission;
  riskLevel: McpGatewayRiskLevel;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  source: "nodeskclaw";
  lastSyncedAt: string;
  /** v6.7 — server-side approval metadata from nodeskclaw tools/list */
  approvalMode?: McpGatewayApprovalMode;
  requiresApproval?: boolean;
  authorized?: boolean;
  grantStatus?: McpGatewayGrantStatus;
  grantId?: string;
  approvalRequestId?: string;
  expiresAt?: string | null;
}

export interface McpGatewayDiagnosticsResult {
  ok: boolean;
  checkedAt: string;
  auth: DiagnosticCheck;
  backend: DiagnosticCheck;
  localProxy: DiagnosticCheck;
  remoteMcp: DiagnosticCheck;
  toolsList: DiagnosticCheck;
  defaultProfileRegistration: DiagnosticCheck;
  hermesGateway: DiagnosticCheck;
  toolCount: number;
  tools: McpGatewayToolPreview[];
  hermesRestartRequired: boolean;
  defaultProfileRegistered: boolean;
  errors: DiagnosticError[];
  steps: DiagnosticCheck[];
  /** @deprecated use defaultProfileRegistration */
  hermesRegistration?: DiagnosticCheck;
  /** Debug-only raw probe / direct initialize; does not affect ok or errors */
  debugRaw?: {
    probe?: unknown;
    remoteInitialize?: {
      ok: boolean;
      error?: string;
      httpStatus?: number;
      response?: unknown;
    };
  };
}

export interface McpGatewayInvokeTestInput {
  toolName: string;
  arguments?: Record<string, unknown>;
  /** @deprecated use arguments */
  input?: Record<string, unknown>;
}

export interface McpGatewayInvokeTestResult {
  ok: boolean;
  toolName: string;
  permission: McpGatewayToolPermission;
  durationMs: number;
  result?: unknown;
  resultTruncated?: boolean;
  errorCode?: McpGatewayOperationsErrorCode | McpSkillGatewayDesktopErrorCode;
  errorMessage?: string;
  /** v6.7 — server authorization outcome from nodeskclaw tools/call */
  approvalRequired?: boolean;
  approvalRequestId?: string;
  grantStatus?: string;
  /** v7.0 — structuredContent task hints from tools/call */
  taskHints?: import("../hermes-client/hermes-client-contract").RecentHermesTask;
}

export type McpGatewayProxyLogLevel = "info" | "warn" | "error";

export interface McpGatewayProxyLogEntry {
  time: string;
  level: McpGatewayProxyLogLevel;
  method?: string;
  jsonrpcId?: string | number | null;
  remoteStatus?: number;
  durationMs?: number;
  errorCode?: string | number;
  message?: string;
  /** v6.7 — approval / grant context for tools/call failures */
  toolName?: string;
  taskId?: string;
  approvalRequestId?: string;
  grantId?: string;
  grantStatus?: string;
}
