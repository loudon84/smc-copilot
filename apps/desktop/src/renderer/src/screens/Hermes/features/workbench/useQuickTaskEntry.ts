import { useCallback, useState } from "react";
import type { WorkExpert } from "../../model/expert";

export function useQuickTaskEntry(recommendedExperts: WorkExpert[]) {
  const [prompt, setPrompt] = useState("");
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);

  const selectedExpert =
    recommendedExperts.find((e) => e.id === selectedExpertId) ??
    recommendedExperts.find((e) => e.status === "ready") ??
    recommendedExperts[0] ??
    null;

  const selectExpert = useCallback((expertId: string) => {
    setSelectedExpertId(expertId);
  }, []);

  const reset = useCallback(() => {
    setPrompt("");
    setSelectedExpertId(null);
  }, []);

  return {
    prompt,
    setPrompt,
    selectedExpert,
    selectExpert,
    reset,
  };
}
