import { useCallback, useEffect, useState } from "react";
import type { RuntimeJobView } from "../../../../../shared/copilot-runtime";

type LogTab = "runtime" | "instance" | "expertMcp" | "jobs";

function jobIdOf(job: RuntimeJobView & { id?: string }): string {
  return job.jobId || job.id || "";
}

export function RuntimeLogsSection(): React.JSX.Element {
  const [tab, setTab] = useState<LogTab>("runtime");
  const [lines, setLines] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<RuntimeJobView[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.copilotRuntime) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === "runtime") {
        const result = await window.copilotRuntime.getDiagnosticsLogs({ tail: 120 });
        setLines(result?.lines?.join("\n") ?? "(no logs)");
      } else if (tab === "instance") {
        const instances = await window.copilotRuntime.listInstances();
        const first = instances[0];
        if (!first) {
          setLines("(no instances)");
        } else {
          const result = await window.copilotRuntime.getInstanceLogs(first.instanceId, {
            tail: 120,
          });
          setLines(result?.lines?.join("\n") ?? "(no logs)");
        }
      } else if (tab === "expertMcp") {
        const diag = await window.copilotRuntime.getExpertMcpDiagnostics();
        setLines(
          [
            "# Expert MCP Diagnostics (no dedicated log API yet)",
            JSON.stringify(diag ?? {}, null, 2),
          ].join("\n"),
        );
      } else {
        const list = (await window.copilotRuntime.listRuntimeJobs?.()) ?? [];
        setJobs(list);
        const preferred =
          selectedJobId && list.some((j) => jobIdOf(j) === selectedJobId)
            ? selectedJobId
            : list[0]
              ? jobIdOf(list[0])
              : null;
        setSelectedJobId(preferred);
        if (!preferred) {
          setLines("(no runtime jobs)");
        } else {
          const detail = await window.copilotRuntime.getRuntimeJob(preferred);
          const summary = list
            .slice(0, 20)
            .map(
              (j) =>
                `${jobIdOf(j)} · ${j.jobType ?? "job"} · ${j.status}${
                  j.errorMessage ? ` · ${j.errorMessage}` : ""
                }`,
            )
            .join("\n");
          setLines(
            [
              "# Runtime Jobs",
              summary || "(empty)",
              "",
              `# Selected Job ${preferred}`,
              JSON.stringify(detail ?? {}, null, 2),
            ].join("\n"),
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [tab, selectedJobId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  async function exportBundle(): Promise<void> {
    if (!window.copilotRuntime?.exportDiagnosticsBundle) return;
    const result = await window.copilotRuntime.exportDiagnosticsBundle();
    if (!result.ok) setError(result.message ?? "Export failed");
  }

  function copyLogs(): void {
    void navigator.clipboard.writeText(lines);
  }

  return (
    <div
      id="runtime-logs-section"
      className="settings-section"
      data-testid="runtime-logs-section"
    >
      <div className="settings-section-title">Runtime Logs & Diagnostics</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {(
          [
            ["runtime", "Runtime"],
            ["instance", "Hermes Instance"],
            ["expertMcp", "Expert MCP Diagnostics"],
            ["jobs", "Runtime Jobs"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`btn ${tab === key ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "jobs" && jobs.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {jobs.slice(0, 12).map((job) => {
            const id = jobIdOf(job);
            return (
              <button
                key={id}
                type="button"
                className={`btn ${selectedJobId === id ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSelectedJobId(id)}
              >
                {(job.jobType ?? "job").slice(0, 18)} · {job.status}
              </button>
            );
          })}
        </div>
      ) : null}
      {error ? (
        <p className="settings-field-hint" role="alert">
          {error}
        </p>
      ) : null}
      <pre
        className="settings-field-hint"
        style={{ maxHeight: 280, overflow: "auto", whiteSpace: "pre-wrap" }}
      >
        {lines || (busy ? "Loading…" : "(empty)")}
      </pre>
      <div className="settings-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setAutoRefresh((v) => !v)}
        >
          Auto Refresh: {autoRefresh ? "On" : "Off"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={copyLogs}>
          Copy
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void exportBundle()}>
          Export Bundle
        </button>
      </div>
    </div>
  );
}
