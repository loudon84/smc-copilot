import { useI18n } from "../../../components/useI18n";

export function SessionSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <input
      className="workspaces-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t("workspaces.sessions.search", { defaultValue: "Search sessions…" })}
    />
  );
}
