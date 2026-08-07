import { useEffect, useState } from "react";
import { workApi } from "../../../../api/workApi";
import { ComposerPopoverSelect } from "./ComposerPopoverSelect";

type Props = {
  value?: string;
  onChange: (teamId: string | undefined) => void;
  disabled?: boolean;
};

export function TeamSelector({ value, onChange, disabled }: Props) {
  const [teams, setTeams] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    void workApi.teams.list().then((items) => {
      setTeams(items.map((t) => ({ id: t.id, label: t.displayName })));
    });
  }, []);

  return (
    <ComposerPopoverSelect
      value={value}
      options={teams}
      disabled={disabled}
      searchable
      placeholder="—"
      onChange={onChange}
    />
  );
}
