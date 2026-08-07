export function StatusToast({ message }: { message: string }): React.JSX.Element | null {
  if (!message) return null;
  return <div className="workspaces-webchat-status-toast">{message}</div>;
}
