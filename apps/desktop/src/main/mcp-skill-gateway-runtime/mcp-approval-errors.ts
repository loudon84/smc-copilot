/** v6.7 — nodeskclaw MCP tool approval error codes and mapping. */

import type { McpGatewayOperationsErrorCode } from "../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";

export const MCP_TOOL_APPROVAL_ERROR_CODES = [
  "MCP_TOOL_APPROVAL_REQUIRED",
  "MCP_TOOL_GRANT_REVOKED",
  "MCP_TOOL_GRANT_EXPIRED",
  "MCP_TOOL_CONSTRAINT_VIOLATION",
] as const;

export type McpToolApprovalErrorCode = (typeof MCP_TOOL_APPROVAL_ERROR_CODES)[number];

export interface McpToolApprovalErrorContext {
  errorCode: string;
  approvalRequestId?: string;
  grantId?: string;
  grantStatus?: string;
  toolName?: string;
  approvalRequired?: boolean;
}

const TOOL_TO_OP_ERROR: Record<McpToolApprovalErrorCode, McpGatewayOperationsErrorCode> = {
  MCP_TOOL_APPROVAL_REQUIRED: "MCP_OP_TOOL_APPROVAL_REQUIRED",
  MCP_TOOL_GRANT_REVOKED: "MCP_OP_TOOL_GRANT_REVOKED",
  MCP_TOOL_GRANT_EXPIRED: "MCP_OP_TOOL_GRANT_EXPIRED",
  MCP_TOOL_CONSTRAINT_VIOLATION: "MCP_OP_TOOL_CONSTRAINT_VIOLATION",
};

export function mapToolApprovalErrorToOp(code: string | undefined): McpGatewayOperationsErrorCode | undefined {
  if (!code) return undefined;
  if (code in TOOL_TO_OP_ERROR) {
    return TOOL_TO_OP_ERROR[code as McpToolApprovalErrorCode];
  }
  return undefined;
}

export function extractApprovalErrorContext(
  errorPayload: unknown,
  toolName?: string,
): McpToolApprovalErrorContext | null {
  if (!errorPayload || typeof errorPayload !== "object") return null;
  const err = errorPayload as {
    code?: number;
    message?: string;
    data?: Record<string, unknown>;
  };
  const data = err.data;
  const rawCode =
    (typeof data?.errorCode === "string" ? data.errorCode : undefined) ??
    (typeof data?.code === "string" ? data.code : undefined);
  if (!rawCode || !MCP_TOOL_APPROVAL_ERROR_CODES.includes(rawCode as McpToolApprovalErrorCode)) {
    return null;
  }

  return {
    errorCode: rawCode,
    approvalRequestId:
      typeof data?.approvalRequestId === "string" ? data.approvalRequestId : undefined,
    grantId: typeof data?.grantId === "string" ? data.grantId : undefined,
    grantStatus: typeof data?.grantStatus === "string" ? data.grantStatus : undefined,
    toolName: typeof data?.toolName === "string" ? data.toolName : toolName,
    approvalRequired: rawCode === "MCP_TOOL_APPROVAL_REQUIRED",
  };
}
