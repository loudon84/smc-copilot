export function StatusToast({
  message,
  variant = "info",
}: {
  message: string;
  variant?: "info" | "error";
}): React.JSX.Element | null {
  if (!message) return null;
  return (
    <div
      className={`hermes-status-toast hermes-status-toast--${variant}`}
      role="status"
      title={variant === "error" ? message : undefined}
    >
      {message}
    </div>
  );
}

