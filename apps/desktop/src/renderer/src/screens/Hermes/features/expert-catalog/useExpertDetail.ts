import { useEffect, useState } from "react";
import { workApi } from "../../api/workApi";
import type { WorkExpertSkill } from "../../model/expert";

export function useExpertDetail(slug: string | undefined, open: boolean) {
  const [skills, setSkills] = useState<WorkExpertSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !slug?.trim() || !window.hermesExperts) {
      setSkills([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void workApi.experts
      .listCatalogSkills(slug)
      .then((list) => {
        if (cancelled) return;
        setSkills(list.filter((s) => s.callEnabled !== false));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setSkills([]);
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  return { skills, loading, error };
}
