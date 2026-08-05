type ModelOption = { id: string; label: string };

type Props = {
  models: ModelOption[];
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
};

export function ModelPicker({
  models,
  selectedModelId,
  onSelect,
  disabled,
}: Props): React.JSX.Element | null {
  if (models.length === 0) return null;
  return (
    <div className="model-picker">
      <label>
        Model
        <select
          value={selectedModelId || ""}
          disabled={disabled}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">Default</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
