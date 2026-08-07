import type { HermesPanelToolCall } from "../types";

export function WebOperatorHermesPanelToolCard({
  toolCall,
}: {
  toolCall: HermesPanelToolCall;
}): React.JSX.Element {
  return (
    <div className="web-operator-hermes-panel__tool-card">
      <span>{toolCall.done ? "✓" : "…"}</span> {toolCall.name}
    </div>
  );
}
