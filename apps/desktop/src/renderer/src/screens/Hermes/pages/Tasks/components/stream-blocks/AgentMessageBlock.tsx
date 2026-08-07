type Props = {
  content: string;
  participantName?: string;
};

export function AgentMessageBlock({ content, participantName }: Props) {
  return (
    <div className="hermes-stream-block hermes-stream-block--agent">
      {participantName ? (
        <div className="hermes-stream-block__author">{participantName}</div>
      ) : null}
      <div className="hermes-stream-block__bubble hermes-stream-block__markdown">
        {content.split("\n").map((line, i) => (
          <p key={i}>{line || "\u00A0"}</p>
        ))}
      </div>
    </div>
  );
}
