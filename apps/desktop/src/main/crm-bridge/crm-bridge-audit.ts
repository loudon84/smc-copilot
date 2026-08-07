import { randomUUID } from "crypto";
import type { CrmBridgeAuditRecord } from "../../shared/crm-bridge/crm-bridge-errors";

const MAX_AUDIT = 200;
const auditRecords: CrmBridgeAuditRecord[] = [];
const listeners: Array<(record: CrmBridgeAuditRecord) => void> = [];

export function logCrmBridgeAudit(
  partial: Omit<CrmBridgeAuditRecord, "id" | "createdAt">,
): CrmBridgeAuditRecord {
  const record: CrmBridgeAuditRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...partial,
  };
  auditRecords.unshift(record);
  if (auditRecords.length > MAX_AUDIT) {
    auditRecords.length = MAX_AUDIT;
  }
  for (const listener of listeners) {
    listener(record);
  }
  return record;
}

export function listCrmBridgeAudit(limit = 50): CrmBridgeAuditRecord[] {
  return auditRecords.slice(0, Math.max(1, Math.min(limit, MAX_AUDIT)));
}

export function onCrmBridgeAudit(callback: (record: CrmBridgeAuditRecord) => void): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
