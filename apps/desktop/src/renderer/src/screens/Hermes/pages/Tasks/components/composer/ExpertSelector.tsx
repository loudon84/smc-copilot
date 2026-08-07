import { useEffect, useState } from "react";
import { workApi } from "../../../../api/workApi";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function ExpertSelector({ value, onChange, disabled }: Props) {
  const [experts, setExperts] = useState<{ id: string; displayName: string }[]>([]);

  useEffect(() => {
    void workApi.experts.list().then(setExperts);
  }, []);

  const toggle = (id: string) => {
    if (disabled) return;
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  if (!experts.length) return null;

  return (
    <div className="hermes-composer-expert-selector">
      {experts.slice(0, 8).map((expert) => (
        <button
          key={expert.id}
          type="button"
          className={`hermes-task-chip${value.includes(expert.id) ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => toggle(expert.id)}
        >
          {expert.displayName}
        </button>
      ))}
    </div>
  );
}
