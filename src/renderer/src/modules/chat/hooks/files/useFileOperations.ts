import { useCallback, useState } from "react";

export interface UseFileOperationsResult {
  openExternal: (fileId: string) => Promise<void>;
  revealInFolder: (fileId: string) => Promise<void>;
  saveAs: (fileId: string) => Promise<string | null>;
  busy: boolean;
  error: string | null;
}

/**
 * Thin wrappers around `window.chatFiles.platform.{openExternal,revealInFolder,
 * saveAs}` â€?tracks a shared busy/error flag so a context menu or preview
 * panel can disable itself mid-request without wiring up its own state.
 * All three take a `ManagedFile` id, so callers need a File Platform id
 * (not a legacy `Attachment`) before these are usable.
 */
export function useFileOperations(profile?: string): UseFileOperationsResult {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const openExternal = useCallback(
    async (fileId: string): Promise<void> => {
      await run(() => window.chatFiles.platform.openExternal(profile, fileId));
    },
    [profile, run],
  );

  const revealInFolder = useCallback(
    async (fileId: string): Promise<void> => {
      await run(() => window.chatFiles.platform.revealInFolder(profile, fileId));
    },
    [profile, run],
  );

  const saveAs = useCallback(
    (fileId: string): Promise<string | null> =>
      run(() => window.chatFiles.platform.saveAs(profile, fileId)),
    [profile, run],
  );

  return { openExternal, revealInFolder, saveAs, busy, error };
}

export default useFileOperations;
