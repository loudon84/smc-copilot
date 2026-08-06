import { useTranslation } from "react-i18next";
import type { SessionCatalogFiltersState } from "./sessionCatalogTypes";
import type { SessionCatalogStatus } from "@shared/session-catalog/session-catalog-contract";

type Props = {
  filters: SessionCatalogFiltersState;
  knownProfiles: string[];
  onChange: (patch: Partial<SessionCatalogFiltersState>) => void;
  onRefresh: () => void;
};

const STATUSES: Array<SessionCatalogStatus | "all"> = [
  "all",
  "active",
  "completed",
  "waiting_approval",
  "waiting_clarify",
  "interrupted",
  "failed",
];

export function SessionCatalogFilters({
  filters,
  knownProfiles,
  onChange,
  onRefresh,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="hermes-page__actions session-catalog-filters">
      <input
        className="hermes-input"
        placeholder={t("workspaces.hermes.sessions.search")}
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") onRefresh();
        }}
        data-testid="session-catalog-search"
      />
      <label className="session-catalog-filters__label">
        <span>{t("workspaces.hermes.sessions.filterProfile")}</span>
        <select
          className="hermes-input"
          value={filters.profileId}
          onChange={(e) =>
            onChange({
              profileId: e.target.value as SessionCatalogFiltersState["profileId"],
            })
          }
          data-testid="session-catalog-profile-filter"
        >
          <option value="all">{t("workspaces.hermes.sessions.allProfiles")}</option>
          {knownProfiles.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="session-catalog-filters__label">
        <span>{t("workspaces.hermes.sessions.filterStatus")}</span>
        <select
          className="hermes-input"
          value={filters.status}
          onChange={(e) =>
            onChange({
              status: e.target.value as SessionCatalogFiltersState["status"],
            })
          }
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? t("workspaces.hermes.sessions.statusAll") : s}
            </option>
          ))}
        </select>
      </label>
      <label className="session-catalog-filters__check">
        <input
          type="checkbox"
          checked={filters.showDrafts}
          onChange={(e) => onChange({ showDrafts: e.target.checked })}
        />
        {t("workspaces.hermes.sessions.drafts")}
      </label>
      <label className="session-catalog-filters__check">
        <input
          type="checkbox"
          checked={filters.includeArchived}
          onChange={(e) => onChange({ includeArchived: e.target.checked })}
        />
        {t("workspaces.hermes.sessions.archived")}
      </label>
      <button
        type="button"
        className="hermes-btn-ghost"
        onClick={onRefresh}
        data-testid="session-catalog-refresh"
      >
        {t("workspaces.hermes.sessions.refresh")}
      </button>
    </div>
  );
}
