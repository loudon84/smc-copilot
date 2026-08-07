import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ExpertCatalogQuery,
  ExpertCatalogSource,
  ExpertGatewayDiagnostics,
} from "../../../../../../shared/hermes-experts/hermes-experts-contract";
import { workApi } from "../../api/workApi";
import type { WorkExpert } from "../../model/expert";
import { MOCK_EXPERTS } from "../../pages/Experts/mock/expert-mock-data";
import { mapHermesExpert } from "../../api/workApi";
import { filterExperts } from "./expertCatalogFilter";

export function useExpertCatalog(initialQuery?: ExpertCatalogQuery) {
  const [experts, setExperts] = useState<WorkExpert[]>(() =>
    MOCK_EXPERTS.map(mapHermesExpert),
  );
  const [catalogSource, setCatalogSource] = useState<ExpertCatalogSource>("mock");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<ExpertGatewayDiagnostics | null>(null);
  const [desktopSyncRegistered, setDesktopSyncRegistered] = useState(false);
  const [category, setCategory] = useState(initialQuery?.category ?? "all");
  const [keyword, setKeyword] = useState(initialQuery?.keyword ?? "");

  const loadGatewayMeta = useCallback(async () => {
    if (!window.hermesExperts) return;
    try {
      const [diag, sync] = await Promise.all([
        workApi.gateway.diagnostics(),
        workApi.gateway.desktopSyncStatus(),
      ]);
      setDiagnostics(diag);
      if (sync.ok && sync.data) setDesktopSyncRegistered(sync.data.registered);
    } catch {
      /* optional meta */
    }
  }, []);

  const refresh = useCallback(
    async (query?: ExpertCatalogQuery) => {
      setLoading(true);
      setError(null);
      const effectiveQuery = {
        category: query?.category ?? category,
        keyword: query?.keyword ?? keyword,
      };

      try {
        if (!window.hermesExperts) {
          setExperts(filterExperts(MOCK_EXPERTS.map(mapHermesExpert), effectiveQuery));
          setCatalogSource("mock");
          return;
        }
        const page = await workApi.experts.listPage(effectiveQuery);
        setExperts(page.items);
        setCatalogSource(page.source);
        await loadGatewayMeta();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setExperts(filterExperts(MOCK_EXPERTS.map(mapHermesExpert), effectiveQuery));
        setCatalogSource("mock");
      } finally {
        setLoading(false);
      }
    },
    [category, keyword, loadGatewayMeta],
  );

  const clearCache = useCallback(async () => {
    if (!window.hermesExperts) return;
    await workApi.gateway.clearCatalogCache();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => filterExperts(experts, { category, keyword }),
    [experts, category, keyword],
  );

  return {
    experts: filtered,
    allExperts: experts,
    catalogSource,
    loading,
    error,
    diagnostics,
    desktopSyncRegistered,
    category,
    setCategory,
    keyword,
    setKeyword,
    refresh,
    clearCache,
  };
}
