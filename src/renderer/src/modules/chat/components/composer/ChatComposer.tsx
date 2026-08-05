type Props = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAbort: () => void;
  isBusy: boolean;
  composerControlsSlot?: React.ReactNode;
  modelPickerSlot?: React.ReactNode;
  attachmentTraySlot?: React.ReactNode;
  queueLength?: number;
  disabled?: boolean;
};

/**
 * Production ChatComposer — textarea + Send/Stop + Work slots.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onAbort,
  isBusy,
  composerControlsSlot,
  modelPickerSlot,
  attachmentTraySlot,
  queueLength = 0,
  disabled,
}: Props): React.JSX.Element {
  return (
    <div className="composer">
      {composerControlsSlot}
      {modelPickerSlot}
      {attachmentTraySlot}
      {queueLength > 0 && (
        <div className="chat-queue">{queueLength} queued</div>
      )}
      <textarea
        className="composer-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!isBusy) onSend();
          }
        }}
        placeholder="Message Hermes…"
        rows={3}
        disabled={disabled}
      />
      <div className="composer-actions">
        {isBusy ? (
          <button type="button" onClick={onAbort}>
            Stop
          </button>
        ) : (
          <button type="button" onClick={onSend} disabled={!value.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
