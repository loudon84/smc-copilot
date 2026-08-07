import { useCallback, useState } from "react";
import type { ExpertInstallPlan } from "../../../../../../../shared/hermes-experts/hermes-experts-contract";

export function useExpertInstall() {
  const [plan, setPlan] = useState<ExpertInstallPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewExpert = useCallback(async (expertId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hermesExperts.previewInstallExpert(expertId);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Preview failed");
        setPlan(null);
        return null;
      }
      setPlan(result.data);
      return result.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPlan(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const installExpert = useCallback(async (expertId: string, overwrite = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hermesExperts.installExpert(expertId, { overwrite });
      if (!result.ok) {
        setError(result.error ?? "Install failed");
        return result;
      }
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const previewTeam = useCallback(async (teamId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hermesExperts.previewInstallTeam(teamId);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Preview failed");
        setPlan(null);
        return null;
      }
      setPlan(result.data);
      return result.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPlan(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const installTeam = useCallback(async (teamId: string, overwrite = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.hermesExperts.installTeam(teamId, { overwrite });
      if (!result.ok) {
        setError(result.error ?? "Install failed");
        return result;
      }
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    plan,
    loading,
    error,
    previewExpert,
    installExpert,
    previewTeam,
    installTeam,
    clearPlan: () => setPlan(null),
  };
}
