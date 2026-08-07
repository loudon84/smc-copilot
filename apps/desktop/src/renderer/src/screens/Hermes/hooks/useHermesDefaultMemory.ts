import { useCallback, useEffect, useState } from "react";
import { hermesDefaultApi } from "../api/hermesDefaultApi";

export type HermesMemorySnapshot = Awaited<
  ReturnType<typeof hermesDefaultApi.memory.read>
>;

export function useHermesDefaultMemory() {
  const [memory, setMemory] = useState<HermesMemorySnapshot | null>(null);
  const [soul, setSoul] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mem, soulText] = await Promise.all([
        hermesDefaultApi.memory.read(),
        hermesDefaultApi.memory.readSoul(),
      ]);
      setMemory(mem);
      setSoul(soulText);
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
    memory,
    soul,
    loading,
    error,
    refresh,
    writeSoul: hermesDefaultApi.memory.writeSoul,
    resetSoul: hermesDefaultApi.memory.resetSoul,
    addEntry: hermesDefaultApi.memory.addMemoryEntry,
    updateEntry: hermesDefaultApi.memory.updateMemoryEntry,
    removeEntry: hermesDefaultApi.memory.removeMemoryEntry,
    writeUserProfile: hermesDefaultApi.memory.writeUserProfile,
  };
}
