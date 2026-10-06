import { useCallback } from "react";
import {
  clearRemoteExpertScratchSelection,
  selectRemoteExpertModeTransition,
  type ChatRun,
  type RemoteExpertSelectTarget,
} from "./chatRuns";

export function useRemoteExpertRunTransition(input: {
  runs: ChatRun[];
  activeRunId: string;
  setRuns: (next: ChatRun[] | ((prev: ChatRun[]) => ChatRun[])) => void;
  setActiveRunId: (id: string) => void;
  profile: string;
  confirm: (message: string) => boolean;
  t: (key: string) => string;
  goToChat?: () => void;
}): {
  selectRemoteExpert: (
    runId: string,
    target: RemoteExpertSelectTarget,
    options?: { hasTranscript?: boolean },
  ) => void;
  clearScratchSelection: (runId: string) => void;
} {
  const {
    runs,
    setRuns,
    setActiveRunId,
    profile,
    confirm,
    t,
    goToChat,
  } = input;

  const selectRemoteExpert = useCallback(
    (
      runId: string,
      target: RemoteExpertSelectTarget,
      options?: { hasTranscript?: boolean },
    ) => {
      // T0 snapshot — commit uses a single deterministic transition result.
      const snapshotRuns = runs;
      const result = selectRemoteExpertModeTransition(
        snapshotRuns,
        runId,
        profile,
        target,
        options,
      );
      if (result.kind === "noop" || result.kind === "invalid") {
        return;
      }
      if (result.kind === "requires-confirm") {
        if (!confirm(t(result.confirmKey))) {
          return;
        }
      }
      setRuns(result.runs);
      setActiveRunId(result.activeRunId);
      goToChat?.();
    },
    [runs, profile, confirm, t, setRuns, setActiveRunId, goToChat],
  );

  const clearScratchSelection = useCallback(
    (runId: string) => {
      setRuns((prev) => clearRemoteExpertScratchSelection(prev, runId));
    },
    [setRuns],
  );

  return { selectRemoteExpert, clearScratchSelection };
}
