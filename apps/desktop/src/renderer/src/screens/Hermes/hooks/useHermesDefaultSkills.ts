import { useCallback, useEffect, useState } from "react";
import { hermesDefaultApi } from "../api/hermesDefaultApi";

export function useHermesDefaultSkills() {
  const [installed, setInstalled] = useState<
    Array<{ name: string; category: string; description: string; path: string }>
  >([]);
  const [bundled, setBundled] = useState<
    Array<{
      name: string;
      description: string;
      category: string;
      source: string;
      installed: boolean;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ins, bun] = await Promise.all([
        hermesDefaultApi.skills.installed(),
        hermesDefaultApi.skills.bundled(),
      ]);
      setInstalled(ins);
      setBundled(bun);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    installed,
    bundled,
    loading,
    error,
    refresh,
    install: hermesDefaultApi.skills.install,
    uninstall: hermesDefaultApi.skills.uninstall,
    read: hermesDefaultApi.skills.read,
  };
}
