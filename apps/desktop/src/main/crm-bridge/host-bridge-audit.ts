import { randomUUID } from "crypto";
import type { HostBridgeAuditRecord } from "../../shared/crm-bridge/host-bridge-errors";

const MAX_AUDIT = 200;
const auditRecords: HostBridgeAuditRecord[] = [];

export function logHostBridgeAudit(
  partial: Omit<HostBridgeAuditRecord, "id" | "createdAt">,
): HostBridgeAuditRecord {
  const record: HostBridgeAuditRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...partial,
  };
  auditRecords.unshift(record);
  if (auditRecords.length > MAX_AUDIT) {
    auditRecords.length = MAX_AUDIT;
  }
  console.log(
    `[HOST-BRIDGE] ${record.auditAction} ${record.status}${record.message ? `: ${record.message}` : ""}`,
  );
  return record;
}

export function listHostBridgeAudit(limit = 50): HostBridgeAuditRecord[] {
  return auditRecords.slice(0, Math.max(1, Math.min(limit, MAX_AUDIT)));
}
