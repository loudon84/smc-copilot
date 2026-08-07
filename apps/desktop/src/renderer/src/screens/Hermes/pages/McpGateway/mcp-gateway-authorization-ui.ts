import type {
  McpGatewayGrantStatus,
  McpGatewayToolPreview,
} from "../../../../../../shared/mcp-skill-gateway-runtime/mcp-gateway-operations-contract";

type Translate = (key: string) => string;

export function grantStatusLabel(
  tool: McpGatewayToolPreview,
  t: Translate,
): string {
  if (tool.permission === "read" && !tool.requiresApproval) {
    return t("workspaces.hermes.mcpGateway.grantStatusNotRequired");
  }
  const status = tool.grantStatus;
  if (status === "active") return t("workspaces.hermes.mcpGateway.grantStatusActive");
  if (status === "missing") return t("workspaces.hermes.mcpGateway.grantStatusMissing");
  if (status === "pending") return t("workspaces.hermes.mcpGateway.grantStatusPending");
  if (status === "revoked") return t("workspaces.hermes.mcpGateway.grantStatusRevoked");
  if (status === "expired") return t("workspaces.hermes.mcpGateway.grantStatusExpired");
  if (status === "disabled") return t("workspaces.hermes.mcpGateway.grantStatusDisabled");
  if (tool.requiresApproval && tool.authorized === false) {
    return t("workspaces.hermes.mcpGateway.toolApprovalRequired");
  }
  return t("workspaces.hermes.mcpGateway.toolStatusAvailable");
}

export function grantStatusBadgeClass(status?: McpGatewayGrantStatus): string {
  if (status === "active") return "hermes-badge hermes-badge--running";
  if (status === "revoked" || status === "expired" || status === "disabled") {
    return "hermes-badge hermes-badge--error";
  }
  if (status === "missing" || status === "pending") {
    return "hermes-badge hermes-badge--starting";
  }
  return "hermes-badge hermes-badge--stopped";
}

export function toolAuthorizationHint(
  tool: McpGatewayToolPreview,
  t: Translate,
): string | null {
  if (tool.grantStatus === "revoked") {
    return t("workspaces.hermes.mcpGateway.toolGrantRevokedHint");
  }
  if (
    tool.requiresApproval &&
    tool.grantStatus !== "active" &&
    tool.authorized !== true
  ) {
    return t("workspaces.hermes.mcpGateway.toolApprovalRequiredHint");
  }
  return null;
}

export function formatAuthorizedValue(
  tool: McpGatewayToolPreview,
  t: Translate,
): string {
  if (tool.permission === "read" && !tool.requiresApproval) {
    return t("workspaces.hermes.mcpGateway.grantStatusNotRequired");
  }
  if (tool.authorized === true) return t("workspaces.hermes.mcpGateway.toolAuthorized");
  if (tool.authorized === false) return t("workspaces.hermes.mcpGateway.toolNotAuthorized");
  return "—";
}
