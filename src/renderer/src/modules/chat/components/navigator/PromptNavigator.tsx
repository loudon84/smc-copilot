export function PromptNavigator(props: {
  anchors: Array<{ id: string; label: string }>;
  onJump?: (id: string) => void;
}): React.JSX.Element | null {
  if (props.anchors.length === 0) return null;
  return (
    <nav className="prompt-navigator" aria-label="Prompt navigator">
      {props.anchors.map((a) => (
        <button key={a.id} type="button" onClick={() => props.onJump?.(a.id)}>
          {a.label}
        </button>
      ))}
    </nav>
  );
}
