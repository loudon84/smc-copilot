import { useCallback, useEffect, useState } from "react";
import type {
  RuntimeCapabilitiesView,
  RuntimeConnectionState,
  RuntimeDiagnosticsSummary,
  RuntimePairingStartResult,
} from "../../../shared/copilot-runtime";
import { createInitialRuntimeConnectionState } from "../../../shared/copilot-runtime";

export function useCopilotRuntime(): {
  state: RuntimeConnectionState;
  capabilities: RuntimeCapabilitiesView | null;
  diagnostics: RuntimeDiagnosticsSummary | null;
  pairing: RuntimePairingStartResult | null;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  repair: () => Promise<void>;
  startPairing: () => Promise<void>;
  confirmPairing: () => Promise<void>;
  loadDiagnostics: () => Promise<void>;
  canWrite: boolean;
} {
  const [state, setState] = useState<RuntimeConnectionState>(
    createInitialRuntimeConnectionState(),
  );
  const [capabilities, setCapabilities] = useState<RuntimeCapabilitiesView | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnosticsSummary | null>(null);
  const [pairing, setPairing] = useState<RuntimePairingStartResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime) return;
    const next = await window.copilotRuntime.getState();
    setState(next);
    const caps = await window.copilotRuntime.getCapabilities();
    setCapabilities(caps);
  }, []);

  useEffect(() => {
    void refresh();
    if (!window.copilotRuntime) return;
    const unsub = window.copilotRuntime.onStateChanged((next) => {
      setState(next);
    });
    return unsub;
  }, [refresh]);

  const retry = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime) return;
    setBusy(true);
    setError(null);
    try {
      const next = await window.copilotRuntime.retry();
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const repair = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.copilotRuntime.repair();
      if (!result.ok) {
        setError(result.message ?? "Repair failed");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const startPairing = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.copilotRuntime.startPairing();
      setPairing(result);
      if (!result.pairingId) {
        setError(result.message ?? "Failed to start pairing");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const confirmPairing = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime || !pairing?.pairingId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.copilotRuntime.confirmPairing(pairing.pairingId);
      if (!result.ok) {
        setError(result.message ?? "Pairing confirm failed");
      } else {
        setPairing(null);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [pairing, refresh]);

  const loadDiagnostics = useCallback(async (): Promise<void> => {
    if (!window.copilotRuntime) return;
    setBusy(true);
    try {
      const summary = await window.copilotRuntime.getDiagnosticsSummary();
      setDiagnostics(summary);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    state,
    capabilities,
    diagnostics,
    pairing,
    busy,
    error,
    refresh,
    retry,
    repair,
    startPairing,
    confirmPairing,
    loadDiagnostics,
    canWrite: state.ready && state.state === "Ready",
  };
}

/** Gate helper: block Chat/Task/MCP mutating actions when Runtime is not Ready. */
export function assertRuntimeReadyForWrite(state: RuntimeConnectionState): string | null {
  if (state.state === "Ready" && state.ready) return null;
  return `Runtime is ${state.state}. Chat / Task / MCP writes are blocked until Ready.`;
}
