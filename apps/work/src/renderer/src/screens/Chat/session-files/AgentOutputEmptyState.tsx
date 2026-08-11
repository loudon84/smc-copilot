/** Empty state when a session has no agent-output ManagedFiles. */

export function AgentOutputEmptyState(): React.JSX.Element {
  return (
    <div className="session-files-empty agent-output-empty">
      No agent files
    </div>
  );
}

export default AgentOutputEmptyState;
