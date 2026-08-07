export function UserMessageBlock({ content }: { content: string }) {
  return (
    <div className="hermes-stream-block hermes-stream-block--user">
      <div className="hermes-stream-block__bubble">{content}</div>
    </div>
  );
}
