import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useBrowserActionLogs } from "./hooks/use-browser-action-logs";
import { useAuditLog } from "./hooks/use-audit-log";
import type { BrowserActionSource, BrowserActionStatus } from "../../../../shared/browser/browser-contract";

interface BrowserActionLogProps {
  className?: string;
}

export function BrowserActionLog({ className }: BrowserActionLogProps) {
  const { logs: v57Logs, clear: clearV57 } = useBrowserActionLogs();
  const { records, filterSource, setFilterSource, filterStatus, setFilterStatus } = useAuditLog();
  const [tab, setTab] = useState<"structured" | "audit">("structured");

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ""}`}>
      <div className="px-3 py-2 border-b border-neutral-700 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-neutral-300">Action Log</h3>
          {tab === "structured" ? (
            <button
              type="button"
              onClick={() => void clearV57()}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400"
              title="Clear logs"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
        <div className="flex gap-1 mb-2">
          <button
            type="button"
            className={`text-xs px-2 py-0.5 rounded ${
              tab === "structured" ? "bg-neutral-700 text-neutral-200" : "text-neutral-500"
            }`}
            onClick={() => setTab("structured")}
          >
            Structured ({v57Logs.length})
          </button>
          <button
            type="button"
            className={`text-xs px-2 py-0.5 rounded ${
              tab === "audit" ? "bg-neutral-700 text-neutral-200" : "text-neutral-500"
            }`}
            onClick={() => setTab("audit")}
          >
            Audit ({records.length})
          </button>
        </div>
        {tab === "audit" ? (
          <div className="flex gap-2">
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as BrowserActionSource | "all")}
              className="bg-neutral-800 rounded px-1.5 py-0.5 text-xs text-neutral-300 outline-none"
            >
              <option value="all">All sources</option>
              <option value="user">User</option>
              <option value="hermes">Hermes</option>
              <option value="system">System</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as BrowserActionStatus | "all")}
              className="bg-neutral-800 rounded px-1.5 py-0.5 text-xs text-neutral-300 outline-none"
            >
              <option value="all">All status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5 min-h-0">
        {tab === "structured" ? (
          v57Logs.length === 0 ? (
            <p className="text-xs text-neutral-500 py-2">No structured action logs</p>
          ) : (
            [...v57Logs].reverse().map((entry) => (
              <div key={entry.id} className="text-xs py-1 border-b border-neutral-800">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-neutral-500 tabular-nums">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                  <span
                    className={`font-mono ${
                      entry.result.ok ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {entry.result.ok ? "ok" : "fail"}
                  </span>
                  <span className="text-neutral-400">{entry.action}</span>
                  <span className="text-neutral-500">{entry.result.durationMs}ms</span>
                </div>
                {entry.result.frameId && (
                  <p className="text-neutral-500 mt-0.5">frame: {entry.result.frameId}</p>
                )}
                {entry.result.selector && (
                  <p className="text-neutral-500 font-mono truncate">{entry.result.selector}</p>
                )}
                {entry.result.error && (
                  <p className="text-red-400 mt-0.5">
                    {entry.result.error.code}: {entry.result.error.message}
                  </p>
                )}
              </div>
            ))
          )
        ) : records.length === 0 ? (
          <p className="text-xs text-neutral-500 py-2">No audit records</p>
        ) : (
          records.map((record) => (
            <div key={record.id} className="text-xs py-1 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 tabular-nums">
                  {new Date(record.time).toLocaleTimeString()}
                </span>
                <span
                  className={`font-mono ${
                    record.status === "success"
                      ? "text-green-500"
                      : record.status === "failed"
                        ? "text-red-500"
                        : "text-yellow-500"
                  }`}
                >
                  {record.status}
                </span>
                <span className="text-neutral-400">{record.action}</span>
              </div>
              {record.errorCode && (
                <p className="text-red-400 mt-0.5">
                  {record.errorCode}: {record.message}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}