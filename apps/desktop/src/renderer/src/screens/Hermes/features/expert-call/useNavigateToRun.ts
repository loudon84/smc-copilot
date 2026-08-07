import { useCallback } from "react";
import { useHermesDefault } from "../../context/HermesDefaultContext";

export function useNavigateToRun() {
  const { navigateToExpertRun } = useHermesDefault();

  return useCallback(
    (runId: string) => {
      navigateToExpertRun(runId);
    },
    [navigateToExpertRun],
  );
}
