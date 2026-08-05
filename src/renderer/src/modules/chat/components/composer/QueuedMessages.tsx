type Props = {
  count: number;
};

export function QueuedMessages({ count }: Props): React.JSX.Element | null {
  if (count <= 0) return null;
  return <div className="chat-queue queued-messages">{count} queued</div>;
}
