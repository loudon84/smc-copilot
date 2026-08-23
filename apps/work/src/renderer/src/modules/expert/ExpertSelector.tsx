import { useCallback, useEffect, useState } from "react";
import type {
  ExpertCatalogItem,
  ExpertSkillItem,
} from "../../../../shared/expert";

export interface ExpertSelection {
  expertSlug: string | null;
  skillName: string | null;
}

interface ExpertSelectorProps {
  disabled?: boolean;
  value: ExpertSelection;
  onChange: (value: ExpertSelection) => void;
}

export function ExpertSelector({
  disabled,
  value,
  onChange,
}: ExpertSelectorProps) {
  const [catalog, setCatalog] = useState<ExpertCatalogItem[]>([]);
  const [skills, setSkills] = useState<ExpertSkillItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await window.hermesAPI.expert.listCatalog();
      setCatalog(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!value.expertSlug) {
      setSkills([]);
      return;
    }
    let cancelled = false;
    void window.hermesAPI.expert
      .listSkills(value.expertSlug)
      .then((items) => {
        if (!cancelled) setSkills(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setSkills([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [value.expertSlug]);

  return (
    <div className="expert-selector" data-testid="expert-selector">
      <select
        aria-label="Expert"
        disabled={disabled || loading}
        value={value.expertSlug ?? ""}
        onChange={(e) => {
          const slug = e.target.value || null;
          onChange({ expertSlug: slug, skillName: null });
        }}
      >
        <option value="">Local Chat</option>
        {catalog.map((item) => (
          <option key={item.slug} value={item.slug}>
            {item.name}
          </option>
        ))}
      </select>
      {value.expertSlug ? (
        <select
          aria-label="Skill"
          disabled={disabled || skills.length === 0}
          value={value.skillName ?? ""}
          onChange={(e) => {
            onChange({
              expertSlug: value.expertSlug,
              skillName: e.target.value || null,
            });
          }}
        >
          <option value="">Select skill</option>
          {skills.map((skill) => (
            <option key={skill.name} value={skill.name}>
              {skill.name}
            </option>
          ))}
        </select>
      ) : null}
      {error ? (
        <span className="expert-selector-error" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
