import type { HostBridgeErrorCode } from "./host-bridge-contract";

export type HostBridgeAuditAction =
  | "host.event.received"
  | "host.event.rejected"
  | "host.event.routed"
  | "host.command.sent"
  | "host.command.completed"
  | "host.command.failed"
  | "host.handoff.created"
  | "host.handoff.none"
  | "host.handoff.delivered"
  | "host.handoff.failed"
  | "host.tab.opened"
  | "host.tab.closed";

export type HostBridgeAuditStatus = "success" | "failed" | "blocked";

export interface HostBridgeAuditRecord {
  id: string;
  requestId?: string;
  eventType?: string;
  origin?: string;
  url?: string;
  formType?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  auditAction: HostBridgeAuditAction;
  status: HostBridgeAuditStatus;
  errorCode?: HostBridgeErrorCode;
  message?: string;
  createdAt: string;
}

export function createHostBridgeError(
  errorCode: HostBridgeErrorCode,
  message: string,
): { ok: false; errorCode: HostBridgeErrorCode; message: string } {
  return { ok: false, errorCode, message };
}
