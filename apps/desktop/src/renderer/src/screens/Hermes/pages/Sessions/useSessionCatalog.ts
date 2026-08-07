import { useCallback, useEffect, useState } from "react";
import type {
  SessionCatalogListResult,
  SessionCatalogQuery,
} from "@shared/session-catalog/session-catalog-contract";
import type {
  SessionCatalogFiltersState,
  SessionCatalogViewModel,
} from "./sessionCatalogTypes";

const DEFAULT_FILTERS: SessionCatalogFiltersState = {
  profileId: "all",
  search: "",
  status: "all",
  includeArchived: false,
  showDrafts: true,
};

export function useSessionCatalog() {
  const [filters, setFilters] = useState<SessionCatalogFiltersState>(DEFAULT_FILTERS);
  const [view, setView] = useState<SessionCatalogViewModel>({
    items: [],
    drafts: [],
    loading: true,
    error: null,
    profilesUnavailable: [],
    knownProfiles: ["default"],
  });

  const refresh = useCallback(async (next?: Partial<SessionCatalogFiltersState>) => {
    const f = { ...filters, ...next };
    if (next) setFilters(f);
    setView((v) => ({ ...v, loading: true, error: null }));
    try {
      if (!window.sessionCatalog) {
        setView((v) => ({
          ...v,
          loading: false,
          error: "Session catalog API unavailable",
          items: [],
          drafts: [],
        }));
        return;
      }
      const query: SessionCatalogQuery = {
        profileId: f.profileId,
        search: f.search.trim() || undefined,
        status: f.status,
        includeArchived: f.includeArchived,
        includeDrafts: f.showDrafts,
        limit: 120,
      };
      const result: SessionCatalogListResult = await window.sessionCatalog.list(query);
      const profiles = new Set<string>(["default"]);
      for (const item of result.items) profiles.add(item.profileId);
      for (const d of result.drafts) profiles.add(d.profileId);
      setView({
        items: result.items,
        drafts: result.drafts,
        loading: false,
        error: result.error ?? null,
        profilesUnavailable: result.profilesUnavailable,
        knownProfiles: [...profiles].sort(),
      });
    } catch (e) {
      setView((v) => ({
        ...v,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [filters]);

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount once

  useEffect(() => {
    if (!window.sessionCatalog?.onChanged) return;
    return window.sessionCatalog.onChanged(() => {
      void refresh();
    });
  }, [refresh]);

  return { filters, setFilters, view, refresh };
}
