import { useTranslation } from "react-i18next";
import type { RunFilterKey } from "../../../features/expert-run/runFilter";
import { RUN_FILTERS } from "../../../features/expert-run/runFilter";

type Props = {
  filter: RunFilterKey;
  onFilterChange: (filter: RunFilterKey) => void;
};

export function RunFilterBar({ filter, onFilterChange }: Props) {
  const { t } = useTranslation();

  return (
    <nav className="hermes-category-tabs" aria-label="Run filters">
      {RUN_FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          className={filter === f.key ? "is-active" : undefined}
          onClick={() => onFilterChange(f.key)}
        >
          {t(f.labelKey)}
        </button>
      ))}
    </nav>
  );
}
