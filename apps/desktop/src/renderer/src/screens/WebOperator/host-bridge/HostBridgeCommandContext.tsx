import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HostBridgeResult, HostDesktopCommand } from "../../../../../shared/crm-bridge";
import { useHostBridgeEvents } from "../hooks/use-host-bridge-events";
import type { HostBridgeCommandContextValue } from "./types";

const HostBridgeCommandContextReact =
  createContext<HostBridgeCommandContextValue | null>(null);

export function HostBridgeCommandProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const { lastEvent, lastReadyEvent } = useHostBridgeEvents();
  const [sending, setSending] = useState(false);
  const [lastCommandResult, setLastCommandResult] = useState<HostBridgeResult | null>(null);
  const [activeTabLayerId, setActiveTabLayerId] = useState<string | null>(null);

  const refreshActiveTab = useCallback(async () => {
    const active = await window.aiosBrowser.getActiveWebOperatorTab();
    setActiveTabLayerId(active?.layerId?.trim() ? active.layerId : null);
  }, []);

  useEffect(() => {
    void refreshActiveTab();
    return window.aiosBrowser.onWebOperatorTabsChanged(() => {
      void refreshActiveTab();
    });
  }, [refreshActiveTab]);

  const hostBridgeReady =
    lastEvent != null || lastReadyEvent != null || activeTabLayerId != null;

  const runCommand = useCallback(async (command: HostDesktopCommand) => {
    setSending(true);
    try {
      const active = await window.aiosBrowser.getActiveWebOperatorTab();
      const layerId = active?.layerId ?? null;
      const result = await window.aiosBrowser.sendHostCommand(command, layerId);
      setLastCommandResult(result);
      return result;
    } catch (e) {
      const failed: HostBridgeResult = {
        ok: false,
        requestId: command.commandId,
        message: e instanceof Error ? e.message : String(e),
        errorCode: "UNKNOWN_ERROR",
      };
      setLastCommandResult(failed);
      return failed;
    } finally {
      setSending(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      lastEvent,
      lastReadyEvent,
      hostBridgeReady,
      runCommand,
      sending,
      lastCommandResult,
    }),
    [lastEvent, lastReadyEvent, hostBridgeReady, runCommand, sending, lastCommandResult],
  );

  return (
    <HostBridgeCommandContextReact.Provider value={value}>
      {children}
    </HostBridgeCommandContextReact.Provider>
  );
}

export function useHostBridgeCommand(): HostBridgeCommandContextValue {
  const ctx = useContext(HostBridgeCommandContextReact);
  if (!ctx) {
    throw new Error(
      "useHostBridgeCommand must be used within HostBridgeCommandProvider",
    );
  }
  return ctx;
}
