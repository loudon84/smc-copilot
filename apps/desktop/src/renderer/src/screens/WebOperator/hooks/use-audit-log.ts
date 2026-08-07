import { useState, useEffect, useCallback } from "react";
import type { BrowserAuditRecord, BrowserActionSource, BrowserActionStatus } from "../../../../../shared/browser/browser-contract";

export function useAuditLog() {
  const [records, setRecords] = useState<BrowserAuditRecord[]>([]);
  const [filterSource, setFilterSource] = useState<BrowserActionSource | "all">("all");
  const [filterStatus, setFilterStatus] = useState<BrowserActionStatus | "all">("all");

  useEffect(() => {
    window.aiosBrowser.getAuditLog(100).then((initial) => {
      setRecords(initial);
    }).catch(() => {});

    const cleanup = window.aiosBrowser.onAuditUpdate((record) => {
      setRecords((prev) => [...prev, record].slice(-200));
    });

    return cleanup;
  }, []);

  const filteredRecords = records.filter((r) => {
    if (filterSource !== "all" && r.source !== filterSource) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  return { records: filteredRecords, filterSource, setFilterSource, filterStatus, setFilterStatus };
}
