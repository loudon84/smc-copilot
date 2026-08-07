import { useEffect, useState } from "react";
import { hermesDefaultApi } from "../../../../api/hermesDefaultApi";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function SkillSelector({ value, onChange, disabled }: Props) {
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    void hermesDefaultApi.skills.installed().then((items) => {
      setSkills(items.map((s) => ({ id: s.name, name: s.name })));
    });
  }, []);

  const toggle = (id: string) => {
    if (disabled) return;
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  if (!skills.length) return null;

  return (
    <div className="hermes-composer-skill-selector">
      {skills.slice(0, 8).map((skill) => (
        <button
          key={skill.id}
          type="button"
          className={`hermes-task-chip${value.includes(skill.id) ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => toggle(skill.id)}
        >
          {skill.name}
        </button>
      ))}
    </div>
  );
}
