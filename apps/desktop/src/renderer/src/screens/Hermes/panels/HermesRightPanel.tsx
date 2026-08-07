import { LAYOUT } from "../constants";
import { HermesRightInspectorTabs } from "../components/HermesRightInspectorTabs";
import { useHermesDefault } from "../context/HermesDefaultContext";
import { useHermesWorkspace } from "../context/HermesWorkspaceContext";
import { HERMES_DEFAULT_PROFILE_META } from "../constants";
import { HermesRuntimePanel } from "./HermesRuntimePanel";
import { HermesExpertInspectorPanel } from "./HermesExpertInspectorPanel";

type Props = {
  onOpenRuntimeSettings?: () => void;
};

export function HermesRightPanel({ onOpenRuntimeSettings }: Props) {
  const { activeRightTab, skills, memory } = useHermesDefault();
  const workspace = useHermesWorkspace();

  return (
    <aside
      className="hermes-right-panel"
      style={
        { "--hermes-right-width": `${LAYOUT.rightPanelWidthPx}px` } as React.CSSProperties
      }
    >
      <HermesRightInspectorTabs />
      <div className="hermes-right-panel-body">
        {activeRightTab === "runtime" ? (
          <HermesRuntimePanel onOpenRuntimeSettings={onOpenRuntimeSettings} />
        ) : null}
        {activeRightTab === "skills" ? (
          <div className="hermes-panel-root hermes-panel-padded">
            <div className="hermes-inspector-section">
              <h4>Installed skills</h4>
              {skills.loading ? (
                <p className="hermes-panel-muted">Loading…</p>
              ) : (
                <ul className="hermes-list">
                  {skills.installed.map((s) => (
                    <li key={s.name}>
                      <strong>{s.name}</strong>
                      <span className="hermes-muted"> — {s.description}</span>
                    </li>
                  ))}
                  {skills.installed.length === 0 ? (
                    <li className="hermes-panel-muted">No skills</li>
                  ) : null}
                </ul>
              )}
            </div>
          </div>
        ) : null}
        {activeRightTab === "memory" ? (
          <div className="hermes-panel-root hermes-panel-padded">
            <div className="hermes-inspector-section">
              <h4>Memory stats</h4>
              {memory.memory ? (
                <p>
                  Sessions: {memory.memory.stats.totalSessions} · Messages:{" "}
                  {memory.memory.stats.totalMessages}
                </p>
              ) : (
                <p className="hermes-panel-muted">—</p>
              )}
            </div>
          </div>
        ) : null}
        {activeRightTab === "workspace" ? (
          <div className="hermes-panel-root hermes-panel-padded">
            <div className="hermes-inspector-section">
              <h4>Local Hermes</h4>
              <p>Profile: {HERMES_DEFAULT_PROFILE_META.displayName}</p>
              <p className="hermes-muted">Data: ~/.hermes (default)</p>
              <p className="hermes-muted">与 Agent Workspace 运行时隔离。</p>
            </div>
          </div>
        ) : null}
        {workspace.mode !== "default" && activeRightTab === "timeline" ? (
          <HermesExpertInspectorPanel tab="timeline" />
        ) : null}
        {workspace.mode !== "default" && activeRightTab === "artifacts" ? (
          <HermesExpertInspectorPanel tab="artifacts" />
        ) : null}
        {workspace.mode !== "default" && activeRightTab === "toolsMcp" ? (
          <HermesExpertInspectorPanel tab="toolsMcp" />
        ) : null}
        {workspace.mode !== "default" && activeRightTab === "members" ? (
          <HermesExpertInspectorPanel tab="members" />
        ) : null}
        {workspace.mode !== "default" && activeRightTab === "audit" ? (
          <HermesExpertInspectorPanel tab="audit" />
        ) : null}
      </div>
    </aside>
  );
}
