import { useCallback, useEffect, useState } from "react";
import type { ExpertCatalogKind } from "../../../../../../shared/hermes-experts/hermes-experts-contract";
import { workApi } from "../../api/workApi";
import type { WorkExpertSkill } from "../../model/expert";
import { buildExpertCallInput } from "./buildExpertCallInput";
import { validateExpertCallInput } from "./validateExpertCallInput";

export function useCatalogSkillsForCall(slug: string | undefined, open: boolean) {
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
        const callable = list.filter((s) => s.callEnabled !== false);
        setSkills(callable);
        setLoading(false);
        if (callable.length === 0) {
          setError("No skills available");
        }
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

export function useExpertCall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async (input: {
      slug: string;
      catalogKind: ExpertCatalogKind;
      skillName: string;
      prompt: string;
      includeContext?: boolean;
    }) => {
      const validation = validateExpertCallInput({
        skillName: input.skillName,
        prompt: input.prompt,
      });
      if (!validation.ok) {
        setError(validation.message);
        return { ok: false as const, errorCode: "MCP_INVALID_ARGUMENTS", message: validation.message };
      }

      if (!window.hermesExperts) {
        const message = "API unavailable";
        setError(message);
        return { ok: false as const, errorCode: "EXPERT_MCP_CALL_FAILED", message };
      }

      setLoading(true);
      setError(null);
      const payload = buildExpertCallInput(input);
      const result = await workApi.experts.callCatalogSkill(payload);
      setLoading(false);
      if (!result.ok) {
        setError(result.message ?? result.errorCode ?? "Call failed");
      }
      return result;
    },
    [],
  );

  return { call, loading, error, setError };
}
