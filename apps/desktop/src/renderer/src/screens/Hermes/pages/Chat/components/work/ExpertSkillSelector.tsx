import { useCallback, useEffect, useState } from "react";
import { workExpertGatewayApi } from "../../../../api/workExpertGatewayApi";
import type { UseWorkChatContextReturn, WorkChatSelectedSkill } from "../../../../types/work-chat";
import { WorkPopoverSelect } from "./WorkPopoverSelect";

const LABELS = {
  skill: "Skill",
  noSkill: "No skill selected",
  selectExpertFirst: "Select an expert first",
  noSkills: "No skills available",
  loading: "Loading…",
  error: "Failed to load skills",
} as const;

type Props = {
  context: UseWorkChatContextReturn;
};

export function ExpertSkillSelector({ context }: Props) {
  const { selectedExpert, selectedSkill, setSkill } = context;
  const [skills, setSkills] = useState<WorkChatSelectedSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await workExpertGatewayApi.listExpertSkills(slug);
      setSkills(list);
      if (list.length === 0) setError(LABELS.noSkills);
    } catch (e) {
      setError(e instanceof Error ? e.message : LABELS.error);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedExpert?.slug) {
      setSkills([]);
      setError(null);
      return;
    }
    void loadSkills(selectedExpert.slug);
  }, [selectedExpert?.slug, loadSkills]);

  const disabled = !selectedExpert || loading;
  const placeholder = !selectedExpert
    ? LABELS.selectExpertFirst
    : loading
      ? LABELS.loading
      : error && skills.length === 0
        ? error
        : LABELS.noSkill;

  return (
    <div className="hermes-work-selector">
      <span className="hermes-work-selector__label">{LABELS.skill}</span>
      <WorkPopoverSelect
        value={selectedSkill?.name}
        options={skills.map((s) => ({ id: s.name, label: s.displayName }))}
        placeholder={placeholder}
        disabled={disabled}
        searchable
        placement="top"
        menuWidth={240}
        maxMenuHeight={280}
        onChange={(id) => {
          const skill = skills.find((s) => s.name === id) ?? null;
          setSkill(skill);
        }}
      />
    </div>
  );
}
